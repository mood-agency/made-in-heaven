import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/db.js';
import { urls, analyses } from '../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import { analyzeUrl } from '../services/pagespeed.js';
import { reschedule, removeJob } from '../services/scheduler.js';

const scheduleEnum = z.enum(['manual', 'hourly', 'every6h', 'every12h', 'daily', 'weekly']);

const createSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  scheduleInterval: scheduleEnum.default('manual'),
});

const updateSchema = z.object({
  name: z.string().optional(),
  scheduleInterval: scheduleEnum.optional(),
  isActive: z.boolean().optional(),
});

const router = new Hono();

router.get('/', async (c) => {
  const allUrls = await db.select().from(urls);

  const enriched = await Promise.all(
    allUrls.map(async (u) => {
      const latest = await db
        .select()
        .from(analyses)
        .where(eq(analyses.urlId, u.id))
        .orderBy(desc(analyses.analyzedAt))
        .limit(2);

      const mobile = latest.find((a) => a.strategy === 'mobile') ?? null;
      const desktop = latest.find((a) => a.strategy === 'desktop') ?? null;
      return { ...u, latestMobile: mobile, latestDesktop: desktop };
    }),
  );

  return c.json(enriched);
});

router.post('/', zValidator('json', createSchema), async (c) => {
  const data = c.req.valid('json');
  const [result] = await db.insert(urls).values(data).returning();
  if (data.scheduleInterval !== 'manual') {
    reschedule(result.id, result.url, data.scheduleInterval);
  }
  return c.json(result, 201);
});

router.put('/:id', zValidator('json', updateSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const [updated] = await db.update(urls).set(data).where(eq(urls.id, id)).returning();
  if (!updated) return c.json({ message: 'Not found' }, 404);

  if (data.scheduleInterval !== undefined) {
    reschedule(id, updated.url, updated.scheduleInterval);
  }
  return c.json(updated);
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  removeJob(id);
  await db.delete(urls).where(eq(urls.id, id));
  return c.body(null, 204);
});

router.post('/:id/analyze', async (c) => {
  const id = Number(c.req.param('id'));
  const [url] = await db.select().from(urls).where(eq(urls.id, id)).limit(1);
  if (!url) return c.json({ message: 'Not found' }, 404);

  analyzeUrl(id, url.url).catch(console.error);
  return c.json({ message: 'Analysis started' });
});

export default router;
