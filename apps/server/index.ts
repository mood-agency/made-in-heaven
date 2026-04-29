/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { app } from './app.js';
import { createDbD1 } from './db/d1.js';
import { urls } from './db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { analyzeUrl } from './services/pagespeed.js';
import type { Variables } from './types.js';

type AnalysisMessage = { urlId: number; urlStr: string };

type Env = {
  DB: D1Database;
  PAGESPEED_API_KEY: string;
  ASSETS: Fetcher;
  ANALYSIS_QUEUE: Queue<AnalysisMessage>;
};

const CRON_TO_INTERVAL: Record<string, string> = {
  '0 9 * * *': 'daily',
};

const worker = new Hono<{ Bindings: Env; Variables: Variables }>();

worker.use('*', async (c, next) => {
  c.set('db', createDbD1(c.env.DB));
  c.set('apiKey', c.env.PAGESPEED_API_KEY);
  c.set('enqueueAnalysis', async (urlId, urlStr) => {
    await c.env.ANALYSIS_QUEUE.send({ urlId, urlStr });
  });
  c.set('enqueueBatchAnalysis', async (items) => {
    const messages = items.map((item) => ({ body: item }));
    const BATCH_LIMIT = 100;
    for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
      await c.env.ANALYSIS_QUEUE.sendBatch(messages.slice(i, i + BATCH_LIMIT));
    }
  });
  await next();
});

worker.route('/', app);

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

    const messages = targetUrls.map((u) => ({ body: { urlId: u.id, urlStr: u.url } }));
    const BATCH_LIMIT = 100;
    for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
      await env.ANALYSIS_QUEUE.sendBatch(messages.slice(i, i + BATCH_LIMIT));
    }
    console.log(`[scheduler] ${interval}: enqueued ${targetUrls.length} URLs`);
  },

  async queue(batch: MessageBatch<AnalysisMessage>, env: Env): Promise<void> {
    const db = createDbD1(env.DB);
    await Promise.all(
      batch.messages.map(async (msg) => {
        try {
          await analyzeUrl(db, msg.body.urlId, msg.body.urlStr, env.PAGESPEED_API_KEY);
          msg.ack();
        } catch (err) {
          console.error(`[queue] error urlId=${msg.body.urlId}:`, err);
          msg.retry();
        }
      }),
    );
  },
} satisfies ExportedHandler<Env, AnalysisMessage>;
