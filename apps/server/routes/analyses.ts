import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Variables } from '../types.js';
import { analyses, urls, urlTags, tags } from '../db/schema/index.js';
import { eq, and, desc, inArray } from 'drizzle-orm';

const querySchema = z.object({
  strategy: z.enum(['mobile', 'desktop']).optional(),
  limit: z.string().optional(),
});

const exportQuerySchema = z.object({
  ids: z.string().optional(), // comma-separated URL IDs
});

function csvField(val: string | number | null | undefined): string {
  if (val == null) return '';
  if (typeof val === 'number') return String(val);
  return `"${val.replace(/"/g, '""')}"`;
}

const router = new Hono<{ Variables: Variables }>()
  .get('/export', zValidator('query', exportQuerySchema), async (c) => {
    const db = c.var.db;
    const { ids: idsParam } = c.req.valid('query');
    const filterIds = idsParam
      ? idsParam.split(',').map(Number).filter((n) => !isNaN(n) && n > 0)
      : null;

    const allAnalyses = await db
      .select({
        urlId: analyses.urlId,
        strategy: analyses.strategy,
        analyzedAt: analyses.analyzedAt,
        performanceScore: analyses.performanceScore,
        fcp: analyses.fcp,
        lcp: analyses.lcp,
        tbt: analyses.tbt,
        cls: analyses.cls,
        urlName: urls.name,
        urlStr: urls.url,
      })
      .from(analyses)
      .innerJoin(urls, eq(analyses.urlId, urls.id))
      .where(filterIds && filterIds.length > 0 ? inArray(analyses.urlId, filterIds) : undefined)
      .orderBy(desc(analyses.analyzedAt));

    const urlIds = [...new Set(allAnalyses.map((r) => r.urlId))];
    const tagsMap: Record<number, string[]> = {};
    if (urlIds.length > 0) {
      const tagRows = await db
        .select({ urlId: urlTags.urlId, name: tags.name })
        .from(urlTags)
        .innerJoin(tags, eq(urlTags.tagId, tags.id))
        .where(inArray(urlTags.urlId, urlIds));
      for (const t of tagRows) {
        if (!tagsMap[t.urlId]) tagsMap[t.urlId] = [];
        tagsMap[t.urlId].push(t.name);
      }
    }

    type PivotRow = {
      day: string;
      urlId: number;
      name: string;
      url: string;
      tags: string;
      mobileScore: number | null;
      mobileFcp: number | null;
      mobileLcp: number | null;
      mobileTbt: number | null;
      mobileCls: number | null;
      desktopScore: number | null;
      desktopFcp: number | null;
      desktopLcp: number | null;
      desktopTbt: number | null;
      desktopCls: number | null;
    };

    // Track latest analyzedAt per (urlId, day, strategy) to keep most recent
    const latestTimeMap = new Map<string, number>();
    const pivotMap = new Map<string, PivotRow>();

    for (const row of allAnalyses) {
      if (!row.analyzedAt) continue;
      const day = row.analyzedAt.toISOString().slice(0, 10);
      const dayKey = `${row.urlId}__${day}`;
      const stratKey = `${dayKey}__${row.strategy}`;
      const rowTime = row.analyzedAt.getTime();

      if (!pivotMap.has(dayKey)) {
        pivotMap.set(dayKey, {
          day,
          urlId: row.urlId,
          name: row.urlName ?? row.urlStr,
          url: row.urlStr,
          tags: (tagsMap[row.urlId] ?? []).join(';'),
          mobileScore: null, mobileFcp: null, mobileLcp: null, mobileTbt: null, mobileCls: null,
          desktopScore: null, desktopFcp: null, desktopLcp: null, desktopTbt: null, desktopCls: null,
        });
      }

      const prevTime = latestTimeMap.get(stratKey) ?? 0;
      if (rowTime > prevTime) {
        latestTimeMap.set(stratKey, rowTime);
        const pivot = pivotMap.get(dayKey)!;
        if (row.strategy === 'mobile') {
          pivot.mobileScore = row.performanceScore;
          pivot.mobileFcp = row.fcp;
          pivot.mobileLcp = row.lcp;
          pivot.mobileTbt = row.tbt;
          pivot.mobileCls = row.cls;
        } else {
          pivot.desktopScore = row.performanceScore;
          pivot.desktopFcp = row.fcp;
          pivot.desktopLcp = row.lcp;
          pivot.desktopTbt = row.tbt;
          pivot.desktopCls = row.cls;
        }
      }
    }

    const rows = [...pivotMap.values()].sort((a, b) => {
      if (b.day !== a.day) return b.day.localeCompare(a.day);
      return a.name.localeCompare(b.name);
    });

    const header = 'Date,URL Name,URL,Tags,Mobile Score,Mobile FCP,Mobile LCP,Mobile TBT,Mobile CLS,Desktop Score,Desktop FCP,Desktop LCP,Desktop TBT,Desktop CLS\r\n';
    const csvRows = rows.map((r) => [
      r.day,
      csvField(r.name),
      csvField(r.url),
      csvField(r.tags),
      r.mobileScore ?? '',
      r.mobileFcp ?? '',
      r.mobileLcp ?? '',
      r.mobileTbt ?? '',
      r.mobileCls ?? '',
      r.desktopScore ?? '',
      r.desktopFcp ?? '',
      r.desktopLcp ?? '',
      r.desktopTbt ?? '',
      r.desktopCls ?? '',
    ].join(','));

    const today = new Date().toISOString().slice(0, 10);
    return c.body(header + csvRows.join('\r\n'), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="scores-${today}.csv"`,
    });
  })
  .get('/:urlId', zValidator('query', querySchema), async (c) => {
    const db = c.var.db;
    const urlId = Number(c.req.param('urlId'));
    const { strategy, limit: limitStr } = c.req.valid('query');
    const limit = Math.min(Number(limitStr ?? 50), 200);

    const conditions = [eq(analyses.urlId, urlId)];
    if (strategy) conditions.push(eq(analyses.strategy, strategy as 'mobile' | 'desktop'));

    const rows = await db
      .select()
      .from(analyses)
      .where(and(...conditions))
      .orderBy(desc(analyses.analyzedAt))
      .limit(limit);

    return c.json(rows);
  });

export default router;
