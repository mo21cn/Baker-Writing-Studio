import type { TexConverter } from "./mathjaxRuntime";

export interface TexToSvgOptions {
  displayMode: boolean;
}

/**
 * Converting TeX is by far the most expensive part of a render, and the
 * same formulas show up on every keystroke. A small memo keeps repeated
 * renders cheap; the cap stops a pathological document from pinning
 * megabytes of SVG forever.
 */
const CACHE_LIMIT = 400;
const cache = new Map<string, string>();

let converter: TexConverter | null = null;
let loading: Promise<void> | null = null;

/** True once the MathJax chunk has been evaluated. */
export function isMathJaxReady(): boolean {
  return converter !== null;
}

/**
 * Load and initialise MathJax. Safe to call repeatedly; concurrent
 * callers share one import. A failed load is retried on the next call.
 */
export async function ensureMathJax(): Promise<void> {
  if (converter) return;
  if (!loading) {
    loading = import("./mathjaxRuntime")
      .then((module) => {
        converter = module.createConverter();
      })
      .catch((error: unknown) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export function texToSvg(latex: string, options: TexToSvgOptions): string {
  if (!converter) {
    throw new Error("MathJax runtime has not been loaded yet");
  }

  const key = `${options.displayMode ? "display" : "inline"}\u0000${latex}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const svg = converter(latex, options.displayMode);

  cache.set(key, svg);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  return svg;
}

/** Test hook: how many formulas are memoised right now. */
export function texCacheSize(): number {
  return cache.size;
}
