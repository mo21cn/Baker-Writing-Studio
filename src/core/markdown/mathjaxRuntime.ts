/**
 * MathJax lives behind a dynamic import.
 *
 * `mathjax-full` is ~1.7 MB of the old entry chunk and most documents
 * never contain a formula. Keeping it in its own chunk means the app
 * paints without it; `ensureMathJax()` pulls it in on startup and the
 * preview waits for it once.
 *
 * The converter is created here, not at module scope, so importing this
 * file stays cheap and side-effect free until it is actually used.
 */
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

export type TexConverter = (latex: string, displayMode: boolean) => string;

export function createConverter(): TexConverter {
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

  return (latex, displayMode) =>
    adaptor.innerHTML(
      mathDocument.convert(latex, {
        display: displayMode,
      }),
    );
}
