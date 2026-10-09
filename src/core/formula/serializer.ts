import type { FormulaInput, FormulaOutput, FormulaWrap } from "./model";

const INLINE_RE = /^\$(?!\$)([\s\S]*?)(?<!\$)\$$/;
const DISPLAY_RE = /^\$\$([\s\S]*?)\$\$$/;

/**
 * Strip any leading/trailing `$` / `$$` so we don't double-wrap when the user
 * toggles the wrap mode. The matched wrapper is reported so callers can decide
 * whether to re-apply inline or display markers.
 */
export function stripWrapper(latex: string): string {
  const trimmed = latex.trim();
  const display = DISPLAY_RE.exec(trimmed);
  if (display) {
    return display[1].trim();
  }
  const inline = INLINE_RE.exec(trimmed);
  if (inline) {
    return inline[1].trim();
  }
  return trimmed;
}

/**
 * Convert raw LaTeX into the wrapped output the user requested. When the user
 * supplies input that already has a wrapper, we honour the underlying
 * expression but apply the requested wrap (so toggling between inline and
 * display is idempotent).
 *
 * Macro package substitutions cover two real-world cases:
 *   - MathLive outputs `\displaystyle{}` for some constructs; we strip the
 *     empty placeholder when the user toggles back to inline math.
 *   - Some editors inject `\def\foo{...}`; we leave them intact because they
 *     are valid in `\begin{document}…\end{document}` MathJax contexts.
 */
export function serializeFormula(input: FormulaInput, wrap: FormulaWrap): FormulaOutput {
  const bare = stripWrapper(input.latex);
  const cleaned = bare.replace(/\\displaystyle\{\}/g, "").trim();

  let wrapped = cleaned;
  if (wrap === "inline") {
    wrapped = "$" + cleaned + "$";
  } else if (wrap === "display") {
    wrapped = "$$" + cleaned + "$$";
  }

  return { wrapped, bare: cleaned };
}
