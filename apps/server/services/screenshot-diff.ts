import { decode, encode } from '@jsquash/png';
import pixelmatch from 'pixelmatch';

export interface DiffResult {
  diffPercent: number;
  diffPng: ArrayBuffer;
}

function toArrayBuffer(buf: Buffer | Uint8Array): ArrayBuffer {
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
    return buf.buffer as ArrayBuffer;
  }
  return (buf.buffer as ArrayBuffer).slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export async function computeDiff(
  prevViewPng: ArrayBuffer,
  currViewPng: ArrayBuffer,
): Promise<DiffResult | null> {
  try {
    const [prev, curr] = await Promise.all([
      decode(prevViewPng),
      decode(currViewPng),
    ]);

    const w = Math.min(prev.width, curr.width);
    const h = Math.min(prev.height, curr.height);

    const prevData = w === prev.width && h === prev.height
      ? prev.data
      : clipImageData(prev.data, prev.width, w, h);
    const currData = w === curr.width && h === curr.height
      ? curr.data
      : clipImageData(curr.data, curr.width, w, h);

    const diffData = new Uint8ClampedArray(w * h * 4);
    const changedPixels: number = pixelmatch(prevData, currData, diffData, w, h, {
      threshold: 0.1,
      alpha: 0.3,
    });

    const diffPercent = (changedPixels / (w * h)) * 100;

    const diffPng = await encode(
      { data: diffData, width: w, height: h, colorSpace: 'srgb' } as never,
    );

    return { diffPercent, diffPng };
  } catch (err) {
    console.error('[screenshot-diff] diff failed:', err);
    return null;
  }
}

export async function toPngArrayBuffer(buf: Buffer | Uint8Array): Promise<ArrayBuffer> {
  return toArrayBuffer(buf);
}

function clipImageData(
  data: Uint8ClampedArray,
  srcWidth: number,
  dstWidth: number,
  dstHeight: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  for (let y = 0; y < dstHeight; y++) {
    const srcRow = y * srcWidth * 4;
    const dstRow = y * dstWidth * 4;
    out.set(data.subarray(srcRow, srcRow + dstWidth * 4), dstRow);
  }
  return out;
}
