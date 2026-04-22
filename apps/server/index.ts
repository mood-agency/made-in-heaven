/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { app } from './app.js';
import { createDbD1 } from './db/d1.js';
import { urls } from './db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { analyzeUrl } from './services/pagespeed.js';
import type { Variables } from './types.js';

type Env = {
  DB: D1Database;
  PAGESPEED_API_KEY: string;
};

const CRON_TO_INTERVAL: Record<string, string> = {
  '0 * * * *':    'hourly',
  '0 */6 * * *':  'every6h',
  '0 */12 * * *': 'every12h',
  '0 9 * * *':    'daily',
  '0 9 * * 1':    'weekly',
};

const worker = new Hono<{ Bindings: Env; Variables: Variables }>();

worker.use('*', async (c, next) => {
  c.set('db', createDbD1(c.env.DB));
  c.set('apiKey', c.env.PAGESPEED_API_KEY);
  await next();
});

worker.route('/', app);

export default {
  fetch: worker.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const interval = CRON_TO_INTERVAL[controller.cron];
    if (!interval) {
      console.warn(`[scheduler] cron sin mapeo: ${controller.cron}`);
      return;
    }

    const db = createDbD1(env.DB);
    const activeUrls = await db
      .select()
      .from(urls)
      .where(and(eq(urls.isActive, true), eq(urls.scheduleInterval, interval)));

    console.log(`[scheduler] ${controller.cron} (${interval}): ${activeUrls.length} URL(s)`);

    ctx.waitUntil(
      Promise.all(
        activeUrls.map((u) =>
          analyzeUrl(db, u.id, u.url, env.PAGESPEED_API_KEY).catch((err) =>
            console.error(`[scheduler] error urlId=${u.id}:`, err),
          ),
        ),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
