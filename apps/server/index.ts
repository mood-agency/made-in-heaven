/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { app } from './app.js';
import { createDbD1 } from './db/d1.js';
import { urls } from './db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { analyzeUrl } from './services/pagespeed.js';
import type { Variables } from './types.js';
import { QueueStateDO } from './queue-state-do.js';

export { QueueStateDO };

type AnalysisMessage = { urlId: number; urlStr: string };

type Env = {
  DB: D1Database;
  PAGESPEED_API_KEY: string;
  ASSETS: Fetcher;
  ANALYSIS_QUEUE: Queue<AnalysisMessage>;
  QUEUE_STATE: DurableObjectNamespace;
};

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
  const body: { urlIds?: number[] } = await c.req.json().catch(() => ({}));
  const cancelled = await stub.cancelQueued(body.urlIds);
  return c.json({ cancelled });
});

worker.post('/api/queue/clear', async (c) => {
  const stub = getQueueStateStub(c.env);
  const cleared = await stub.clearAll();
  return c.json({ cleared });
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

  async queue(batch: MessageBatch<AnalysisMessage>, env: Env): Promise<void> {
    const db = createDbD1(env.DB);
    const qsStub = getQueueStateStub(env);
    await Promise.all(
      batch.messages.map(async (msg) => {
        if (await qsStub.isCancelled(msg.body.urlId)) {
          msg.ack();
          return;
        }
        try {
          await qsStub.markRunning(msg.body.urlId);
          await analyzeUrl(db, msg.body.urlId, msg.body.urlStr, env.PAGESPEED_API_KEY);
          await qsStub.markDone(msg.body.urlId);
          msg.ack();
        } catch (err) {
          console.error(`[queue] error urlId=${msg.body.urlId}:`, err);
          await qsStub.markFailed(msg.body.urlId, String(err));
          msg.retry();
        }
      }),
    );
  },
} satisfies ExportedHandler<Env, AnalysisMessage>;
