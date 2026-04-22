import cron from 'node-cron';
import { db } from '../db/db.js';
import { urls } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { analyzeUrl } from './pagespeed.js';

const CRON_MAP: Record<string, string> = {
  hourly:   '0 * * * *',
  every6h:  '0 */6 * * *',
  every12h: '0 */12 * * *',
  daily:    '0 9 * * *',
  weekly:   '0 9 * * 1',
};

const jobs = new Map<number, cron.ScheduledTask>();

function scheduleJob(urlId: number, urlStr: string, interval: string) {
  const expr = CRON_MAP[interval];
  if (!expr) return;
  const task = cron.schedule(expr, () => {
    analyzeUrl(urlId, urlStr).catch(console.error);
  });
  jobs.set(urlId, task);
}

export function reschedule(urlId: number, urlStr: string, newInterval: string) {
  removeJob(urlId);
  if (newInterval !== 'manual') scheduleJob(urlId, urlStr, newInterval);
}

export function removeJob(urlId: number) {
  const existing = jobs.get(urlId);
  if (existing) {
    existing.stop();
    jobs.delete(urlId);
  }
}

export async function initScheduler() {
  const activeUrls = await db
    .select()
    .from(urls)
    .where(eq(urls.isActive, true));

  const scheduled = activeUrls.filter((u) => u.scheduleInterval !== 'manual');
  for (const u of scheduled) {
    scheduleJob(u.id, u.url, u.scheduleInterval);
  }
  console.log(`[scheduler] ${scheduled.length} job(s) initialized`);
}
