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

function extractOgImage(html: string, baseUrl: string): string | null {
  const metaRegex = /<meta\s+([^>]+?)(?:\s*\/)?>/gi;
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = match[1];
    const hasOgImage = /(?:property|name)=["'](?:og:image(?::url)?|twitter:image)["']/i.test(attrs);
    if (hasOgImage) {
      const contentMatch = /content=["']([^"']+)["']/i.exec(attrs);
      if (contentMatch?.[1]) {
        try {
          return new URL(contentMatch[1], baseUrl).toString();
        } catch {
          return contentMatch[1];
        }
      }
    }
  }
  return null;
}

export async function fetchOgImage(urlStr: string): Promise<string | null> {
  try {
    const res = await fetch(urlStr, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MadeInHeavenBot/1.0)',
        'Accept': 'text/html',
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return null;
    const html = await readHead(res);
    return extractOgImage(html, urlStr);
  } catch {
    return null;
  }
}
