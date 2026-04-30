import type { Db } from '../types.js';
import { analyses, urls, settings } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface LighthouseAudit {
  numericValue?: number;
  displayValue?: string;
}

interface LighthouseResult {
  categories: { performance: { score: number } };
  audits: Record<string, LighthouseAudit>;
}

interface PsiResponse {
  lighthouseResult: LighthouseResult;
}

interface PageInfo {
  title?: string;
  description?: string;
}

function extractMetrics(lr: LighthouseResult) {
  return {
    performanceScore: Math.round((lr.categories.performance.score ?? 0) * 100),
    fcp: lr.audits['first-contentful-paint']?.numericValue ?? null,
    lcp: lr.audits['largest-contentful-paint']?.numericValue ?? null,
    tbt: lr.audits['total-blocking-time']?.numericValue ?? null,
    cls: lr.audits['cumulative-layout-shift']?.numericValue ?? null,
    si: lr.audits['speed-index']?.numericValue ?? null,
    tti: lr.audits['interactive']?.numericValue ?? null,
  };
}

function extractPageInfo(lr: LighthouseResult): PageInfo {
  const title = lr.audits['document-title']?.displayValue?.trim() || undefined;
  const description = lr.audits['meta-description']?.displayValue?.trim() || undefined;
  return { title, description };
}

async function getApiKey(db: Db, envKey: string | undefined): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'pagespeed_api_key'))
    .limit(1);
  const dbKey = row?.value?.trim();
  const validKey = dbKey?.startsWith('AIza') ? dbKey : null;
  return validKey || envKey || null;
}

async function runStrategy(url: string, strategy: 'mobile' | 'desktop', apiKey: string | null) {
  const params = new URLSearchParams({ url, strategy });
  if (apiKey) params.set('key', apiKey);

  const res = await fetch(`${PSI_URL}?${params}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PSI API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as PsiResponse;
  return {
    metrics: extractMetrics(data.lighthouseResult),
    pageInfo: extractPageInfo(data.lighthouseResult),
  };
}

export async function analyzeUrl(
  db: Db,
  urlId: number,
  urlStr: string,
  envApiKey?: string,
): Promise<void> {
  const apiKey = await getApiKey(db, envApiKey);
  let capturedPageInfo: PageInfo | null = null;

  for (const strategy of ['mobile', 'desktop'] as const) {
    try {
      const { metrics, pageInfo } = await runStrategy(urlStr, strategy, apiKey);
      await db.insert(analyses).values({ urlId, strategy, ...metrics });
      if (strategy === 'mobile') capturedPageInfo = pageInfo;
    } catch (err) {
      await db.insert(analyses).values({ urlId, strategy, error: String(err) });
    }
  }

  const urlUpdate: Partial<typeof urls.$inferInsert> = { lastAnalyzed: new Date() };

  if (capturedPageInfo?.title || capturedPageInfo?.description) {
    if (capturedPageInfo.title) urlUpdate.metaTitle = capturedPageInfo.title;
    if (capturedPageInfo.description) urlUpdate.metaDescription = capturedPageInfo.description;

    if (capturedPageInfo.title) {
      const [row] = await db.select({ name: urls.name }).from(urls).where(eq(urls.id, urlId)).limit(1);
      if (!row?.name?.trim()) {
        urlUpdate.name = capturedPageInfo.title;
      }
    }
  }

  await db.update(urls).set(urlUpdate).where(eq(urls.id, urlId));
}
