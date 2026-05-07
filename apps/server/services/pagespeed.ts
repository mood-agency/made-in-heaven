import type { Db } from '../types.js';
import { analyses, urls, settings } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

interface R2Storage {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; contentEncoding?: string } }): Promise<unknown>;
}

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface LighthouseResult {
  categories: { performance: { score: number } };
  audits: Record<string, { numericValue?: number }>;
}

interface PsiResponse {
  lighthouseResult: LighthouseResult;
}

function isRetriableError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'TimeoutError') return true;
  if (err instanceof TypeError) return true; // network failure, no response
  if (/PSI API error (429|500|502|503|504|524)/.test(String(err))) return true;
  return false;
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

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out.buffer as ArrayBuffer;
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
  const rawText = await res.text();
  const data = JSON.parse(rawText) as PsiResponse;
  return { metrics: extractMetrics(data.lighthouseResult), rawText };
}

type StrategyResult =
  | { strategy: 'mobile' | 'desktop'; metrics: ReturnType<typeof extractMetrics>; rawText: string; error?: never }
  | { strategy: 'mobile' | 'desktop'; error: string; metrics?: never; rawText?: never };

export async function runPsiAndInsert(
  db: Db,
  urlId: number,
  urlStr: string,
  envApiKey: string | undefined,
  storage: R2Storage,
): Promise<{ mobileId: number; desktopId: number }> {
  const apiKey = await getApiKey(db, envApiKey);
  const results: StrategyResult[] = [];

  for (const strategy of ['mobile', 'desktop'] as const) {
    try {
      const { metrics, rawText } = await runStrategy(urlStr, strategy, apiKey);
      results.push({ strategy, metrics, rawText });
    } catch (err) {
      if (isRetriableError(err)) {
        // Throw before any DB writes so the queue can retry the whole URL cleanly.
        throw err;
      }
      results.push({ strategy, error: String(err) });
    }
  }

  // All strategies completed without retriable errors — commit to DB.
  const ids: Partial<Record<'mobile' | 'desktop', number>> = {};

  for (const result of results) {
    const [row] = await db
      .insert(analyses)
      .values(
        result.metrics
          ? { urlId, strategy: result.strategy, ...result.metrics }
          : { urlId, strategy: result.strategy, error: result.error },
      )
      .returning({ id: analyses.id });
    ids[result.strategy] = row.id;

    if (result.rawText) {
      try {
        const compressed = await gzip(result.rawText);
        const rawKey = `psi-raw/${urlId}/${row.id}-${result.strategy}.json.gz`;
        await storage.put(rawKey, compressed, {
          httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
        });
        await db.update(analyses)
          .set({ rawKey, rawBytes: compressed.byteLength })
          .where(eq(analyses.id, row.id));
      } catch (err) {
        console.error(`[psi-raw] failed to store raw for analysisId=${row.id}:`, err);
      }
    }
  }

  await db.update(urls).set({ lastAnalyzed: new Date() }).where(eq(urls.id, urlId));

  return { mobileId: ids.mobile!, desktopId: ids.desktop! };
}

// Backwards-compatible wrapper for Node / cron callsites (PSI-only, no screenshots)
export async function analyzeUrl(
  db: Db,
  urlId: number,
  urlStr: string,
  envApiKey?: string,
): Promise<void> {
  await runPsiAndInsert(db, urlId, urlStr, envApiKey, undefined as unknown as R2Storage);
}
