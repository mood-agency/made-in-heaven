import { launch, type BrowserWorker } from '@cloudflare/playwright';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const VIEWPORT_CONFIGS = {
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_UA,
  },
  desktop: {
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
} as const;

export interface ScreenshotResult {
  full: Buffer;
  view: Buffer;
}

async function gotoWithFallback(page: Awaited<ReturnType<Awaited<ReturnType<typeof launch>>['newPage']>>, url: string) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch {
    await page.goto(url, { waitUntil: 'load', timeout: 15_000 });
  }
}

export async function captureScreenshots(
  browserBinding: BrowserWorker,
  urlStr: string,
): Promise<Map<'mobile' | 'desktop', ScreenshotResult | null>> {
  const results = new Map<'mobile' | 'desktop', ScreenshotResult | null>();
  const browser = await launch(browserBinding);

  try {
    for (const strategy of ['mobile', 'desktop'] as const) {
      try {
        const config = VIEWPORT_CONFIGS[strategy];
        const context = await browser.newContext(config);
        const page = await context.newPage();
        try {
          await gotoWithFallback(page, urlStr);
          const [full, view] = await Promise.all([
            page.screenshot({ fullPage: true, type: 'png' }),
            page.screenshot({ fullPage: false, type: 'png' }),
          ]);
          results.set(strategy, { full, view });
        } finally {
          await context.close();
        }
      } catch (err) {
        console.error(`[screenshot] ${strategy} failed for ${urlStr}:`, err);
        results.set(strategy, null);
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
