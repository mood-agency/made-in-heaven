/// <reference types="@cloudflare/workers-types" />
import type { BrowserWorker } from '@cloudflare/playwright';
import { captureScreenshots } from './screenshot.js';
import { computeDiff, toPngArrayBuffer } from './screenshot-diff.js';
import { analyses } from '../db/schema/index.js';
import { eq, and, isNotNull, desc } from 'drizzle-orm';
import type { Db } from '../types.js';

interface R2BucketLike {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

export type ScreenshotPipelineEnv = {
  BROWSER: BrowserWorker;
  STORAGE: R2BucketLike;
};

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

export async function captureScreenshotsAndUpdate(
  db: Db,
  urlId: number,
  urlStr: string,
  mobileId: number,
  desktopId: number,
  env: ScreenshotPipelineEnv,
): Promise<void> {
  const ts = Date.now();
  const screenshotMap = await captureScreenshots(env.BROWSER, urlStr);

  const strategyIds: Record<'mobile' | 'desktop', number> = { mobile: mobileId, desktop: desktopId };

  for (const strategy of ['mobile', 'desktop'] as const) {
    const capture = screenshotMap.get(strategy) ?? null;
    if (!capture) continue;

    const fullKey = `screenshots/${urlId}/${ts}-${strategy}.png`;
    const viewKey = `screenshots/${urlId}/${ts}-${strategy}.view.png`;

    const [fullBuf, viewBuf] = await Promise.all([
      toPngArrayBuffer(capture.full),
      toPngArrayBuffer(capture.view),
    ]);

    await Promise.all([
      env.STORAGE.put(fullKey, fullBuf, { httpMetadata: { contentType: 'image/png' } }),
      env.STORAGE.put(viewKey, viewBuf, { httpMetadata: { contentType: 'image/png' } }),
    ]);

    let diffKey: string | null = null;
    let diffPercent: number | null = null;

    const prevViewKey = await getPrevViewKey(db, urlId, strategy);
    if (prevViewKey) {
      const prevObj = await env.STORAGE.get(prevViewKey);
      if (prevObj) {
        const result = await computeDiff(await prevObj.arrayBuffer(), viewBuf);
        if (result) {
          const dKey = `screenshots/${urlId}/${ts}-${strategy}.diff.png`;
          await env.STORAGE.put(dKey, result.diffPng, { httpMetadata: { contentType: 'image/png' } });
          diffKey = dKey;
          diffPercent = result.diffPercent;
        }
      }
    }

    await db
      .update(analyses)
      .set({ screenshotKey: fullKey, screenshotViewKey: viewKey, diffKey, diffPercent })
      .where(eq(analyses.id, strategyIds[strategy]));
  }
}
