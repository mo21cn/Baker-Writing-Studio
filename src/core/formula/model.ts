/**
 * Formula tool data model.
 *
 * The formula page is intentionally editor-agnostic: input is a raw LaTeX
 * string (the user types into a textarea), output is the same LaTeX optionally
 * wrapped in `$...$` or `$$...$$`. The serializer normalises the wrapper so the
 * caller never has to think about leading/trailing delimiters.
 */
export interface FormulaInput {
  latex: string;
}

export type FormulaWrap = "inline" | "display" | "none";

export interface FormulaOutput {
  /** Normalised LaTeX, suitable for pasting into a Markdown document. */
  wrapped: string;
  /** Same LaTeX stripped of any wrapper, used by the live preview renderer. */
  bare: string;
}
