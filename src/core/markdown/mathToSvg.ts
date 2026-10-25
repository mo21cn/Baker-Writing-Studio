import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const texInput = new TeX({
  packages: AllPackages,
});

// fontCache "none" inlines every glyph as a <path>, so each formula SVG is
// fully self-contained. This avoids broken <use> references when a single
// formula is copied out of the document (a known issue when pasting into
// editors such as the WeChat backend).
const svgOutput = new SVG({
  fontCache: "none",
});

const mathDocument = mathjax.document("", {
  InputJax: texInput,
  OutputJax: svgOutput,
});

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

export function texToSvg(latex: string, options: TexToSvgOptions): string {
  const key = `${options.displayMode ? "display" : "inline"}\u0000${latex}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const node = mathDocument.convert(latex, {
    display: options.displayMode,
  });
  const svg = adaptor.innerHTML(node);

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
