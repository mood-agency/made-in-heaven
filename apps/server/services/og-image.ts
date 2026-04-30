export interface PageMeta {
  title: string | null;
  description: string | null;
  image: string | null;
}

async function readHead(response: Response, maxBytes = 150_000): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    text += decoder.decode(value, { stream: bytesRead < maxBytes });
    if (bytesRead >= maxBytes) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return text;
}

function getMetaContent(html: string, ...names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // property/name before content
    let m = new RegExp(
      `<meta\\s+(?:property|name)=["']${escaped}["']\\s+content=["']([^"']+)["']`,
      'i',
    ).exec(html);
    if (m?.[1]) return m[1];
    // content before property/name
    m = new RegExp(
      `<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${escaped}["']`,
      'i',
    ).exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractMeta(html: string, baseUrl: string): PageMeta {
  const ogTitle = getMetaContent(html, 'og:title');
  const rawTitle = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
  const title = (ogTitle ?? rawTitle)?.replace(/\s+/g, ' ').trim() || null;

  const description =
    getMetaContent(html, 'og:description', 'description')
      ?.replace(/\s+/g, ' ')
      .trim() || null;

  const rawImage = getMetaContent(html, 'og:image', 'og:image:url', 'twitter:image');
  let image: string | null = null;
  if (rawImage) {
    try {
      image = new URL(rawImage, baseUrl).toString();
    } catch {
      image = rawImage;
    }
  }

  return { title, description, image };
}

export async function fetchPageMeta(urlStr: string): Promise<PageMeta> {
  try {
    const res = await fetch(urlStr, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MadeInHeavenBot/1.0)',
        'Accept': 'text/html',
      },
    });
    if (!res.ok) return { title: null, description: null, image: null };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return { title: null, description: null, image: null };
    const html = await readHead(res);
    return extractMeta(html, urlStr);
  } catch {
    return { title: null, description: null, image: null };
  }
}
