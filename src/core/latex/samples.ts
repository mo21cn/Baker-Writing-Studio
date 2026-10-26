/**
 * The document the LaTeX page offers when it is empty.
 *
 * Kept in `core` so the end-to-end test can assert on exactly what the button
 * inserts, instead of a copy that drifts.
 */
export const LATEX_SAMPLE = [
  "\\section{引言}",
  "这是一段正文，行内公式 $E = mc^2$ 可以混排。",
  "",
  "\\begin{itemize}",
  "\\item 第一点",
  "\\item 第二点",
  "\\end{itemize}",
].join("\n");
