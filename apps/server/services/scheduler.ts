import cron from 'node-cron';
import type { Db } from '../types.js';
import { urls } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { analyzeUrl } from './pagespeed.js';

const CRON_MAP: Record<string, string> = {
  daily: '0 9 * * *',
};

const jobs = new Map<number, cron.ScheduledTask>();

function scheduleJob(db: Db, apiKey: string | undefined, urlId: number, urlStr: string, interval: string) {
  const expr = CRON_MAP[interval];
  if (!expr) return;
  const task = cron.schedule(expr, () => {
    analyzeUrl(db, urlId, urlStr, apiKey).catch(console.error);
  });
  jobs.set(urlId, task);
}

export function reschedule(db: Db, apiKey: string | undefined, urlId: number, urlStr: string, newInterval: string) {
  removeJob(urlId);
  if (newInterval !== 'manual') scheduleJob(db, apiKey, urlId, urlStr, newInterval);
}

export function removeJob(urlId: number) {
  const existing = jobs.get(urlId);
  if (existing) {
    existing.stop();
    jobs.delete(urlId);
  }
}

export async function initScheduler(db: Db, apiKey?: string) {
  const activeUrls = await db
    .select()
    .from(urls)
    .where(eq(urls.isActive, true));

  const scheduled = activeUrls.filter((u) => u.scheduleInterval !== 'manual');
  for (const u of scheduled) {
    scheduleJob(db, apiKey, u.id, u.url, u.scheduleInterval);
  }
  console.log(`[scheduler] ${scheduled.length} job(s) initialized`);
}
