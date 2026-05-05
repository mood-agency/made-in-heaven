import { decode, encode } from '@jsquash/png';
// @ts-ignore – wasm module import resolved by Wrangler bundler
import squooshPngWasm from './squoosh_png.wasm';
// @ts-ignore – not in package types but exported from wasm-bindgen output
import { initSync } from '@jsquash/png/codec/pkg/squoosh_png.js';
import pixelmatch from 'pixelmatch';

// Initialize the WASM module synchronously at module load time so that
// decode/encode never need to fetch the .wasm file at runtime.
initSync(squooshPngWasm);

export interface DiffResult {
  diffPercent: number;
  diffPng: ArrayBuffer;
}

export async function computeDiff(
  prevViewPng: ArrayBuffer,
  currViewPng: ArrayBuffer,
): Promise<DiffResult | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prev = await decode(prevViewPng) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const curr = await decode(currViewPng) as any;

    const w = Math.min(prev.width, curr.width);
    const h = Math.min(prev.height, curr.height);

    const prevData = (w === prev.width && h === prev.height)
      ? prev.data as Uint8ClampedArray
      : clipImageData(prev.data as Uint8ClampedArray, prev.width, w, h);
    const currData = (w === curr.width && h === curr.height)
      ? curr.data as Uint8ClampedArray
      : clipImageData(curr.data as Uint8ClampedArray, curr.width, w, h);

    const diffData = new Uint8ClampedArray(w * h * 4);
    const changedPixels: number = pixelmatch(
      prevData as unknown as Uint8Array,
      currData as unknown as Uint8Array,
      diffData as unknown as Uint8Array,
      w,
      h,
      { threshold: 0.1, alpha: 0.3 },
    );

    const diffPercent = (changedPixels / (w * h)) * 100;

    const diffPng = await encode({ data: diffData, width: w, height: h, colorSpace: 'srgb' } as never);

    return { diffPercent, diffPng };
  } catch (err) {
    console.error('[screenshot-diff] diff failed:', String(err));
    if (err instanceof Error) console.error('[screenshot-diff] stack:', err.stack);
    return null;
  }
}

export async function toPngArrayBuffer(buf: Buffer | Uint8Array): Promise<ArrayBuffer> {
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
    return buf.buffer as ArrayBuffer;
  }
  return (buf.buffer as ArrayBuffer).slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
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
