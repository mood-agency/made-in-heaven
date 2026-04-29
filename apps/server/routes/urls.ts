import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Variables, Db } from '../types.js';
import { urls, analyses, tags, urlTags } from '../db/schema/index.js';
import { eq, desc, inArray, and } from 'drizzle-orm';
import { analyzeUrl } from '../services/pagespeed.js';

const scheduleEnum = z.enum(['manual', 'daily']);

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

const analyzeSelectedSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
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

// D1 SQLite limit is ~100 bound variables per query
const SQL_CHUNK_SIZE = 100;

const URLS_CACHE_TTL = 10; // seconds

function urlsCacheKey(rawUrl: string): Request {
  const u = new URL(rawUrl);
  u.pathname = '/api/urls';
  u.search = '';
  return new Request(u.toString());
}

type ExecCtx = { waitUntil(p: Promise<unknown>): void };
type CfCacheStorage = { default: Cache };

async function invalidateUrlsCache(rawUrl: string, ctx: ExecCtx | undefined): Promise<void> {
  if (typeof caches === 'undefined') return;
  ctx?.waitUntil((caches as unknown as CfCacheStorage).default.delete(urlsCacheKey(rawUrl)));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function getTagsForUrls(db: Db, urlIds: number[]): Promise<Record<number, string[]>> {
  if (urlIds.length === 0) return {};
  const chunks = chunkArray(urlIds, SQL_CHUNK_SIZE);
  const allRows: { urlId: number; name: string }[] = [];
  for (const chunk of chunks) {
    const rows = await db
      .select({ urlId: urlTags.urlId, name: tags.name })
      .from(urlTags)
      .innerJoin(tags, eq(urlTags.tagId, tags.id))
      .where(inArray(urlTags.urlId, chunk));
    allRows.push(...rows);
  }

  const map: Record<number, string[]> = {};
  for (const row of allRows) {
    if (!map[row.urlId]) map[row.urlId] = [];
    map[row.urlId].push(row.name);
  }
  return map;
}

const router = new Hono<{ Variables: Variables }>()
  .get('/', async (c) => {
    if (typeof caches !== 'undefined') {
      const cached = await (caches as unknown as CfCacheStorage).default.match(urlsCacheKey(c.req.url));
      if (cached) return cached;
    }

    const db = c.var.db;
    const allUrls = await db.select().from(urls);
    const urlIds = allUrls.map((u) => u.id);

    // Chunked queries to stay within D1's SQL variable limit (~100 per query)
    const fetchAnalyses = async () => {
      if (urlIds.length === 0) return [] as (typeof analyses.$inferSelect)[];
      const chunks = chunkArray(urlIds, SQL_CHUNK_SIZE);
      const rows = await Promise.all(
        chunks.map((chunk) =>
          db.select().from(analyses)
            .where(inArray(analyses.urlId, chunk))
            .orderBy(desc(analyses.analyzedAt), desc(analyses.id))
        )
      );
      return rows.flat();
    };

    const [tagsMap, allAnalyses] = await Promise.all([
      getTagsForUrls(db, urlIds),
      fetchAnalyses(),
    ]);

    // One pass to pick the latest mobile and desktop per URL
    const mobileMap: Record<number, typeof allAnalyses[0]> = {};
    const desktopMap: Record<number, typeof allAnalyses[0]> = {};
    for (const a of allAnalyses) {
      if (!mobileMap[a.urlId] && a.strategy === 'mobile') mobileMap[a.urlId] = a;
      if (!desktopMap[a.urlId] && a.strategy === 'desktop') desktopMap[a.urlId] = a;
    }

    const enriched = allUrls.map((u) => ({
      ...u,
      latestMobile: mobileMap[u.id] ?? null,
      latestDesktop: desktopMap[u.id] ?? null,
      tags: tagsMap[u.id] ?? [],
    }));

    const response = new Response(JSON.stringify(enriched), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `s-maxage=${URLS_CACHE_TTL}`,
      },
    });

    if (typeof caches !== 'undefined') {
      c.executionCtx?.waitUntil((caches as unknown as CfCacheStorage).default.put(urlsCacheKey(c.req.url), response.clone()));
    }

    return response;
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
    await invalidateUrlsCache(c.req.url, c.executionCtx);
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
        const domain = extractDomainTag(item.url);
        const allTags = Array.from(new Set([...(tagNames ?? []), ...(domain ? [domain] : [])]));

        let [result] = await db.insert(urls).values(data).onConflictDoNothing().returning();
        if (!result) {
          // URL already exists — update its tags
          [result] = await db.select().from(urls).where(eq(urls.url, item.url)).limit(1);
          if (result) await setUrlTags(db, result.id, allTags);
          continue;
        }

        await setUrlTags(db, result.id, allTags);
        if (data.scheduleInterval !== 'manual') {
          c.var.reschedule?.(result.id, result.url, data.scheduleInterval);
        }
        created.push({ ...result, tags: allTags });
      } catch (err) {
        errors.push({ url: item.url, message: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    await invalidateUrlsCache(c.req.url, c.executionCtx);
    return c.json({ created, errors }, 201);
  })
  .post('/analyze-all', async (c) => {
    const db = c.var.db;
    const activeUrls = await db.select().from(urls).where(eq(urls.isActive, true));

    const enqueueBatch = c.var.enqueueBatchAnalysis;
    if (enqueueBatch) {
      await enqueueBatch(activeUrls.map((u) => ({ urlId: u.id, urlStr: u.url })));
      return c.json({ queued: activeUrls.length });
    }

    // Node.js fallback: process in batches of 3 to respect rate limits
    const CONCURRENCY = 3;
    (async () => {
      for (let i = 0; i < activeUrls.length; i += CONCURRENCY) {
        await Promise.all(
          activeUrls.slice(i, i + CONCURRENCY).map((u) =>
            analyzeUrl(db, u.id, u.url, c.var.apiKey).catch(console.error),
          ),
        );
      }
    })().catch(console.error);

    return c.json({ started: activeUrls.length });
  })
  .post('/analyze-selected', zValidator('json', analyzeSelectedSchema), async (c) => {
    const db = c.var.db;
    const { ids } = c.req.valid('json');

    const selectedUrls = await db
      .select()
      .from(urls)
      .where(and(inArray(urls.id, ids), eq(urls.isActive, true)));

    const enqueueBatch = c.var.enqueueBatchAnalysis;
    if (enqueueBatch) {
      await enqueueBatch(selectedUrls.map((u) => ({ urlId: u.id, urlStr: u.url })));
      return c.json({ queued: selectedUrls.length });
    }

    const CONCURRENCY = 3;
    (async () => {
      for (let i = 0; i < selectedUrls.length; i += CONCURRENCY) {
        await Promise.all(
          selectedUrls.slice(i, i + CONCURRENCY).map((u) =>
            analyzeUrl(db, u.id, u.url, c.var.apiKey).catch(console.error),
          ),
        );
      }
    })().catch(console.error);

    return c.json({ started: selectedUrls.length });
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
    await invalidateUrlsCache(c.req.url, c.executionCtx);
    return c.json({ ...updated, tags: currentTags });
  })
  .delete('/:id', async (c) => {
    const db = c.var.db;
    const id = Number(c.req.param('id'));
    c.var.removeJob?.(id);
    await db.delete(urls).where(eq(urls.id, id));
    await invalidateUrlsCache(c.req.url, c.executionCtx);
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
