import type { Db } from '../types.js';
import { analyses, urls, settings } from '../db/schema/index.js';
import { eq, and, isNotNull, desc } from 'drizzle-orm';
import { captureScreenshots } from './screenshot.js';
import { computeDiff, toPngArrayBuffer } from './screenshot-diff.js';
import type { BrowserWorker } from '@cloudflare/playwright';

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface LighthouseResult {
  categories: { performance: { score: number } };
  audits: Record<string, { numericValue?: number }>;
}

interface PsiResponse {
  lighthouseResult: LighthouseResult;
}

interface R2BucketLike {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

type ScreenshotEnv = {
  BROWSER: BrowserWorker;
  SCREENSHOTS: R2BucketLike;
};

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
  return extractMetrics(data.lighthouseResult);
}

async function getPrevViewKey(db: Db, urlId: number, strategy: 'mobile' | 'desktop'): Promise<string | null> {
  const [prev] = await db
    .select({ screenshotViewKey: analyses.screenshotViewKey })
    .from(analyses)
    .where(and(
      eq(analyses.urlId, urlId),
      eq(analyses.strategy, strategy),
      isNotNull(analyses.screenshotViewKey),
    ))
    .orderBy(desc(analyses.analyzedAt))
    .limit(1);
  return prev?.screenshotViewKey ?? null;
}

export async function analyzeUrl(
  db: Db,
  urlId: number,
  urlStr: string,
  envApiKey?: string,
  screenshotEnv?: ScreenshotEnv,
): Promise<void> {
  const apiKey = await getApiKey(db, envApiKey);

  const screenshotMap = screenshotEnv
    ? await captureScreenshots(screenshotEnv.BROWSER, urlStr).catch(() => null)
    : null;

  const ts = Date.now();

  for (const strategy of ['mobile', 'desktop'] as const) {
    let metrics: ReturnType<typeof extractMetrics> | null = null;
    let metricsError: string | undefined;

    try {
      metrics = await runStrategy(urlStr, strategy, apiKey);
    } catch (err) {
      metricsError = String(err);
    }

    let screenshotKey: string | null = null;
    let screenshotViewKey: string | null = null;
    let diffKey: string | null = null;
    let diffPercent: number | null = null;

    if (screenshotEnv) {
      const capture = screenshotMap?.get(strategy) ?? null;

      if (capture) {
        const fullKey = `screenshots/${urlId}/${ts}-${strategy}.png`;
        const viewKey = `screenshots/${urlId}/${ts}-${strategy}.view.png`;

        const [fullBuf, viewBuf] = await Promise.all([
          toPngArrayBuffer(capture.full),
          toPngArrayBuffer(capture.view),
        ]);

        await Promise.all([
          screenshotEnv.SCREENSHOTS.put(fullKey, fullBuf, {
            httpMetadata: { contentType: 'image/png' },
          }),
          screenshotEnv.SCREENSHOTS.put(viewKey, viewBuf, {
            httpMetadata: { contentType: 'image/png' },
          }),
        ]);

        screenshotKey = fullKey;
        screenshotViewKey = viewKey;

        const prevViewKey = await getPrevViewKey(db, urlId, strategy);
        if (prevViewKey) {
          const prevObj = await screenshotEnv.SCREENSHOTS.get(prevViewKey);
          if (prevObj) {
            const prevBuf = await prevObj.arrayBuffer();
            const result = await computeDiff(prevBuf, viewBuf);
            if (result) {
              const dKey = `screenshots/${urlId}/${ts}-${strategy}.diff.png`;
              await screenshotEnv.SCREENSHOTS.put(dKey, result.diffPng, {
                httpMetadata: { contentType: 'image/png' },
              });
              diffKey = dKey;
              diffPercent = result.diffPercent;
            }
          }
        }
      }
    }

    if (metrics) {
      await db.insert(analyses).values({
        urlId,
        strategy,
        ...metrics,
        screenshotKey,
        screenshotViewKey,
        diffKey,
        diffPercent,
      });
    } else {
      await db.insert(analyses).values({
        urlId,
        strategy,
        error: metricsError,
        screenshotKey,
        screenshotViewKey,
        diffKey,
        diffPercent,
      });
    }
  }

  await db.update(urls).set({ lastAnalyzed: new Date() }).where(eq(urls.id, urlId));
}
