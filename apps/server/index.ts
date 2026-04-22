/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { app } from './app.js';
import { createDbD1 } from './db/d1.js';
import type { Db } from './types.js';
import { urls } from './db/schema/index.js';
import { eq, and, asc } from 'drizzle-orm';
import { analyzeUrl } from './services/pagespeed.js';
import type { Variables } from './types.js';

type Env = {
  DB: D1Database;
  PAGESPEED_API_KEY: string;
  ASSETS: Fetcher;
};

// Daily batches: 3:00am, 3:10am, 3:20am, 3:30am CST (UTC-6 = 9am UTC)
const DAILY_BATCH_CRONS = ['0 9 * * *', '10 9 * * *', '20 9 * * *', '30 9 * * *'];
const DAILY_BATCH_SIZE = 25;

const CRON_TO_INTERVAL: Record<string, string> = {
  '0 * * * *':    'hourly',
  '0 */6 * * *':  'every6h',
  '0 */12 * * *': 'every12h',
  '0 9 * * 1':    'weekly',
};

async function runBatch(
  targetUrls: (typeof urls.$inferSelect)[],
  db: Db,
  apiKey: string,
) {
  const CONCURRENCY = 5;
  for (let i = 0; i < targetUrls.length; i += CONCURRENCY) {
    await Promise.all(
      targetUrls.slice(i, i + CONCURRENCY).map((u) =>
        analyzeUrl(db, u.id, u.url, apiKey).catch((err) =>
          console.error(`[scheduler] error urlId=${u.id}:`, err),
        ),
      ),
    );
  }
}

const worker = new Hono<{ Bindings: Env; Variables: Variables }>();

worker.use('*', async (c, next) => {
  c.set('db', createDbD1(c.env.DB));
  c.set('apiKey', c.env.PAGESPEED_API_KEY);
  await next();
});

worker.route('/', app);

// Serve the React SPA for all non-API routes
worker.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: worker.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = createDbD1(env.DB);

    // Daily: 4 batches of 25 starting at 3am CST, every 10 minutes
    const dailyBatchIndex = DAILY_BATCH_CRONS.indexOf(controller.cron);
    if (dailyBatchIndex !== -1) {
      const targetUrls = await db
        .select()
        .from(urls)
        .where(and(eq(urls.isActive, true), eq(urls.scheduleInterval, 'daily')))
        .orderBy(asc(urls.id))
        .limit(DAILY_BATCH_SIZE)
        .offset(dailyBatchIndex * DAILY_BATCH_SIZE);

      console.log(`[scheduler] daily batch ${dailyBatchIndex + 1}/4: ${targetUrls.length} URL(s)`);
      ctx.waitUntil(runBatch(targetUrls, db, env.PAGESPEED_API_KEY));
      return;
    }

    // Hourly, every6h, every12h, weekly
    const interval = CRON_TO_INTERVAL[controller.cron];
    if (!interval) {
      console.warn(`[scheduler] cron sin mapeo: ${controller.cron}`);
      return;
    }

    const targetUrls = await db
      .select()
      .from(urls)
      .where(and(eq(urls.isActive, true), eq(urls.scheduleInterval, interval)));

    console.log(`[scheduler] ${interval}: ${targetUrls.length} URL(s)`);
    ctx.waitUntil(runBatch(targetUrls, db, env.PAGESPEED_API_KEY));
  },
} satisfies ExportedHandler<Env>;
