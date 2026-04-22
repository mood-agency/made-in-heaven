import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Variables, Db } from '../types.js';
import { urls, analyses, tags, urlTags } from '../db/schema/index.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { analyzeUrl } from '../services/pagespeed.js';

const scheduleEnum = z.enum(['manual', 'hourly', 'every6h', 'every12h', 'daily', 'weekly']);

const createSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  scheduleInterval: scheduleEnum.default('manual'),
  tags: z.array(z.string().min(1)).optional(),
});

const updateSchema = z.object({
  name: z.string().optional(),
  scheduleInterval: scheduleEnum.optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().nullable().optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const bulkSchema = z.object({
  urls: z.array(z.object({
    url: z.string().url(),
    name: z.string().optional(),
    scheduleInterval: scheduleEnum.default('manual'),
    tags: z.array(z.string().min(1)).optional(),
  })).min(1),
});

async function upsertTags(db: Db, tagNames: string[]): Promise<number[]> {
  if (tagNames.length === 0) return [];
  const ids: number[] = [];
  for (const name of tagNames) {
    const normalized = name.trim().toLowerCase();
    if (!normalized) continue;
    await db.insert(tags).values({ name: normalized }).onConflictDoNothing();
    const [tag] = await db.select().from(tags).where(eq(tags.name, normalized)).limit(1);
    if (tag) ids.push(tag.id);
  }
  return ids;
}

async function setUrlTags(db: Db, urlId: number, tagNames: string[]) {
  await db.delete(urlTags).where(eq(urlTags.urlId, urlId));
  const tagIds = await upsertTags(db, tagNames);
  if (tagIds.length > 0) {
    await db.insert(urlTags).values(tagIds.map((tagId) => ({ urlId, tagId })));
  }
}

function extractDomainTag(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function getTagsForUrls(db: Db, urlIds: number[]): Promise<Record<number, string[]>> {
  if (urlIds.length === 0) return {};
  const rows = await db
    .select({ urlId: urlTags.urlId, name: tags.name })
    .from(urlTags)
    .innerJoin(tags, eq(urlTags.tagId, tags.id))
    .where(inArray(urlTags.urlId, urlIds));

  const map: Record<number, string[]> = {};
  for (const row of rows) {
    if (!map[row.urlId]) map[row.urlId] = [];
    map[row.urlId].push(row.name);
  }
  return map;
}

const router = new Hono<{ Variables: Variables }>()
  .get('/', async (c) => {
    const db = c.var.db;
    const allUrls = await db.select().from(urls);
    const urlIds = allUrls.map((u) => u.id);
    const tagsMap = await getTagsForUrls(db, urlIds);

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
        return { ...u, latestMobile: mobile, latestDesktop: desktop, tags: tagsMap[u.id] ?? [] };
      }),
    );

    return c.json(enriched);
  })
  .post('/', zValidator('json', createSchema), async (c) => {
    const db = c.var.db;
    const { tags: tagNames, ...data } = c.req.valid('json');
    const [result] = await db.insert(urls).values(data).returning();
    const domain = extractDomainTag(data.url);
    const allTags = Array.from(new Set([...(tagNames ?? []), ...(domain ? [domain] : [])]));
    await setUrlTags(db, result.id, allTags);
    if (data.scheduleInterval !== 'manual') {
      c.var.reschedule?.(result.id, result.url, data.scheduleInterval);
    }
    return c.json({ ...result, tags: allTags }, 201);
  })
  .post('/bulk', zValidator('json', bulkSchema), async (c) => {
    const db = c.var.db;
    const { urls: items } = c.req.valid('json');
    const created: unknown[] = [];
    const errors: { url: string; message: string }[] = [];

    for (const item of items) {
      const { tags: tagNames, ...data } = item;
      try {
        const [result] = await db.insert(urls).values(data).returning();
        const domain = extractDomainTag(item.url);
        const allTags = Array.from(new Set([...(tagNames ?? []), ...(domain ? [domain] : [])]));
        await setUrlTags(db, result.id, allTags);
        if (data.scheduleInterval !== 'manual') {
          c.var.reschedule?.(result.id, result.url, data.scheduleInterval);
        }
        created.push({ ...result, tags: allTags });
      } catch (err) {
        errors.push({ url: item.url, message: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return c.json({ created, errors }, 201);
  })
  .put('/:id', zValidator('json', updateSchema), async (c) => {
    const db = c.var.db;
    const id = Number(c.req.param('id'));
    const { tags: tagNames, ...data } = c.req.valid('json');

    let updated: typeof urls.$inferSelect;
    if (Object.keys(data).length > 0) {
      const [result] = await db.update(urls).set(data).where(eq(urls.id, id)).returning();
      if (!result) return c.json({ message: 'Not found' }, 404);
      updated = result;
    } else {
      const [result] = await db.select().from(urls).where(eq(urls.id, id)).limit(1);
      if (!result) return c.json({ message: 'Not found' }, 404);
      updated = result;
    }

    if (tagNames !== undefined) {
      await setUrlTags(db, id, tagNames);
    }

    if (data.scheduleInterval !== undefined) {
      c.var.reschedule?.(id, updated.url, updated.scheduleInterval);
    }

    const currentTags = tagNames ?? (await getTagsForUrls(db, [id]))[id] ?? [];
    return c.json({ ...updated, tags: currentTags });
  })
  .delete('/:id', async (c) => {
    const db = c.var.db;
    const id = Number(c.req.param('id'));
    c.var.removeJob?.(id);
    await db.delete(urls).where(eq(urls.id, id));
    return c.body(null, 204);
  })
  .post('/:id/analyze', async (c) => {
    const db = c.var.db;
    const id = Number(c.req.param('id'));
    const [url] = await db.select().from(urls).where(eq(urls.id, id)).limit(1);
    if (!url) return c.json({ message: 'Not found' }, 404);

    const enqueue = c.var.enqueueAnalysis;
    if (enqueue) {
      await enqueue(id, url.url);
      return c.json({ message: 'Analysis queued' });
    }

    const promise = analyzeUrl(db, id, url.url, c.var.apiKey);
    c.executionCtx?.waitUntil(promise);
    return c.json({ message: 'Analysis started' });
  });

export default router;
