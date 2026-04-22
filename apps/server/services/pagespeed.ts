import { db } from '../db/db.js';
import { analyses, urls, settings } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface LighthouseResult {
  categories: { performance: { score: number } };
  audits: Record<string, { numericValue?: number }>;
}

interface PsiResponse {
  lighthouseResult: LighthouseResult;
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

async function getApiKey(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'pagespeed_api_key'))
    .limit(1);
  const dbKey = row?.value?.trim();
  const validKey = dbKey?.startsWith('AIza') ? dbKey : null;
  return validKey || process.env.PAGESPEED_API_KEY || null;
}

async function runStrategy(url: string, strategy: 'mobile' | 'desktop', apiKey: string | null) {
  const params = new URLSearchParams({ url, strategy });
  if (apiKey) params.set('key', apiKey);

  const res = await fetch(`${PSI_URL}?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PSI API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as PsiResponse;
  return extractMetrics(data.lighthouseResult);
}

export async function analyzeUrl(urlId: number, urlStr: string): Promise<void> {
  const apiKey = await getApiKey();

  await Promise.all(
    (['mobile', 'desktop'] as const).map(async (strategy) => {
      try {
        const metrics = await runStrategy(urlStr, strategy, apiKey);
        await db.insert(analyses).values({ urlId, strategy, ...metrics });
      } catch (err) {
        await db.insert(analyses).values({ urlId, strategy, error: String(err) });
      }
    }),
  );

  await db.update(urls).set({ lastAnalyzed: new Date() }).where(eq(urls.id, urlId));
}
