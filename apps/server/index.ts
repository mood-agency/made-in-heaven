/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { app } from './app.js';
import { createDbD1 } from './db/d1.js';
import { urls, analyses } from './db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { runPsiAndInsert } from './services/pagespeed.js';
import { captureScreenshotsAndUpdate } from './services/screenshot-pipeline.js';
import type { Variables } from './types.js';
import { QueueStateDO } from './queue-state-do.js';
import type { BrowserWorker } from '@cloudflare/playwright';

export { QueueStateDO };

type AnalysisMessage = { urlId: number; urlStr: string };
type ScreenshotMessage = { urlId: number; urlStr: string; mobileId: number; desktopId: number };

type Env = {
  DB: D1Database;
  PAGESPEED_API_KEY: string;
  SCREENSHOTS_ENABLED: string;
  ASSETS: Fetcher;
  ANALYSIS_QUEUE: Queue<AnalysisMessage>;
  SCREENSHOT_QUEUE: Queue<ScreenshotMessage>;
  QUEUE_STATE: DurableObjectNamespace;
  BROWSER: BrowserWorker;
  STORAGE: R2Bucket;
};

const screenshotsEnabled = (env: Env) => env.SCREENSHOTS_ENABLED === 'true';

const CRON_TO_INTERVAL: Record<string, string> = {
  '0 9 * * *': 'daily',
};

function getQueueStateStub(env: Env) {
  return env.QUEUE_STATE.get(env.QUEUE_STATE.idFromName('global')) as unknown as QueueStateDO;
}

const worker = new Hono<{ Bindings: Env; Variables: Variables }>();

worker.use('*', async (c, next) => {
  c.set('db', createDbD1(c.env.DB));
  c.set('apiKey', c.env.PAGESPEED_API_KEY);
  const qsStub = getQueueStateStub(c.env);
  c.set('enqueueAnalysis', async (urlId, urlStr) => {
    await qsStub.markQueued([urlId]);
    await c.env.ANALYSIS_QUEUE.send({ urlId, urlStr });
  });
  c.set('enqueueBatchAnalysis', async (items) => {
    await qsStub.markQueued(items.map((i) => i.urlId));
    const messages = items.map((item) => ({ body: item }));
    const BATCH_LIMIT = 100;
    for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
      await c.env.ANALYSIS_QUEUE.sendBatch(messages.slice(i, i + BATCH_LIMIT));
    }
  });
  await next();
});

worker.route('/', app);

worker.get('/api/queue/ws', async (c) => {
  const stub = getQueueStateStub(c.env);
  return (stub as unknown as { fetch: (req: Request) => Promise<Response> }).fetch(c.req.raw);
});

worker.get('/api/queue/state', async (c) => {
  const stub = getQueueStateStub(c.env);
  const entries = await stub.getSnapshot();
  return c.json(entries);
});

worker.post('/api/queue/cancel', async (c) => {
  const stub = getQueueStateStub(c.env);
  const body: { urlIds?: number[]; includeRunning?: boolean } = await c.req.json().catch(() => ({}));
  const cancelled = await stub.cancelQueued(body.urlIds, body.includeRunning);
  return c.json({ cancelled });
});

worker.post('/api/queue/clear', async (c) => {
  const stub = getQueueStateStub(c.env);
  const cleared = await stub.clearAll();
  return c.json({ cleared });
});

worker.get('/api/screenshots/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace('/api/screenshots/', ''));
  const obj = await c.env.STORAGE.get(key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': obj.httpEtag,
    },
  });
});

worker.get('/api/analyses/:id/raw', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.notFound();
  const db = c.var.db;
  const [row] = await db
    .select({ rawKey: analyses.rawKey })
    .from(analyses)
    .where(eq(analyses.id, id))
    .limit(1);
  if (!row?.rawKey) return c.notFound();
  const obj = await c.env.STORAGE.get(row.rawKey);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'private, max-age=300',
    },
  });
});

// Serve the React SPA for all non-API routes
worker.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: worker.fetch,

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const interval = CRON_TO_INTERVAL[controller.cron];
    if (!interval) {
      console.warn(`[scheduler] cron sin mapeo: ${controller.cron}`);
      return;
    }

    const db = createDbD1(env.DB);
    const targetUrls = await db
      .select()
      .from(urls)
      .where(and(eq(urls.isActive, true), eq(urls.scheduleInterval, interval)));

    if (targetUrls.length > 0) {
      const qsStub = getQueueStateStub(env);
      await qsStub.markQueued(targetUrls.map((u) => u.id));
    }

    const messages = targetUrls.map((u) => ({ body: { urlId: u.id, urlStr: u.url } }));
    const BATCH_LIMIT = 100;
    for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
      await env.ANALYSIS_QUEUE.sendBatch(messages.slice(i, i + BATCH_LIMIT));
    }
    console.log(`[scheduler] ${interval}: enqueued ${targetUrls.length} URLs`);
  },

  async queue(
    batch: MessageBatch<AnalysisMessage | ScreenshotMessage>,
    env: Env,
  ): Promise<void> {
    const db = createDbD1(env.DB);
    const qsStub = getQueueStateStub(env);

    if (batch.queue === 'mih-analysis') {
      await Promise.allSettled(
        (batch.messages as Message<AnalysisMessage>[]).map(async (msg) => {
          if (await qsStub.isCancelled(msg.body.urlId)) {
            msg.ack();
            return;
          }
          try {
            await qsStub.markRunning(msg.body.urlId);
            const { mobileId, desktopId } = await runPsiAndInsert(
              db, msg.body.urlId, msg.body.urlStr, env.PAGESPEED_API_KEY, env.STORAGE,
            );
            await qsStub.markDone(msg.body.urlId);

            if (screenshotsEnabled(env) && env.BROWSER && env.STORAGE) {
              await qsStub.markScreenshotQueued(msg.body.urlId);
              await env.SCREENSHOT_QUEUE.send({
                urlId: msg.body.urlId,
                urlStr: msg.body.urlStr,
                mobileId,
                desktopId,
              });
            }

            msg.ack();
          } catch (err) {
            console.error(`[analysis-queue] error urlId=${msg.body.urlId}:`, err);
            await qsStub.markFailed(msg.body.urlId, String(err));
            const errStr = String(err);
            const is429 = errStr.includes('429');
            msg.retry({ delaySeconds: is429 ? 300 : 60 });
          }
        }),
      );
    } else if (batch.queue === 'mih-analysis-dlq') {
      for (const msg of batch.messages as Message<AnalysisMessage>[]) {
        console.error(`[dlq] mih-analysis unrecoverable urlId=${msg.body.urlId}`);
        await qsStub.markFailed(msg.body.urlId, 'Exhausted all retries');
        msg.ack();
      }
    } else if (batch.queue === 'mih-screenshots-dlq') {
      for (const msg of batch.messages as Message<ScreenshotMessage>[]) {
        console.error(`[dlq] mih-screenshots unrecoverable urlId=${msg.body.urlId}`);
        await qsStub.markScreenshotFailed(msg.body.urlId, 'Exhausted all retries');
        msg.ack();
      }
    } else if (batch.queue === 'mih-screenshots') {
      const msg = (batch.messages as Message<ScreenshotMessage>[])[0];
      if (!screenshotsEnabled(env)) {
        msg.ack();
        return;
      }
      if (await qsStub.isCancelled(msg.body.urlId)) {
        msg.ack();
        return;
      }
      try {
        await qsStub.markScreenshotRunning(msg.body.urlId);
        await captureScreenshotsAndUpdate(
          db,
          msg.body.urlId,
          msg.body.urlStr,
          msg.body.mobileId,
          msg.body.desktopId,
          { BROWSER: env.BROWSER, STORAGE: env.STORAGE },
        );
        await qsStub.markScreenshotDone(msg.body.urlId);
        msg.ack();
      } catch (err) {
        console.error(`[screenshot-queue] error urlId=${msg.body.urlId}:`, err);
        await qsStub.markScreenshotFailed(msg.body.urlId, String(err));
        const is429 = String(err).includes('429') || String(err).includes('Rate limit');
        msg.retry(is429 ? { delaySeconds: 300 } : undefined);
      }
    }
  },
} satisfies ExportedHandler<Env, AnalysisMessage | ScreenshotMessage>;
