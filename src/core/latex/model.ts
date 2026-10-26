/**
 * A deliberately small LaTeX reader.
 *
 * This is not a TeX implementation: it understands the handful of commands
 * the preview and the Word export can honour, and reports everything else so
 * the author sees "unsupported" instead of silent nonsense.
 *
 * Two rules keep the reader honest:
 *  - math is never inspected command by command; a math run is handed to
 *    MathJax as-is, so `\,`, `\\`, `\quad` cannot produce false warnings
 *  - only text-mode commands are validated, against `SUPPORTED_TEXT_COMMANDS`
 */

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: InlineNode[] }
  | { kind: "emph"; children: InlineNode[] }
  | { kind: "code"; text: string }
  | { kind: "math"; latex: string; display: false };

export type BlockNode =
  | { kind: "heading"; level: 1 | 2 | 3; children: InlineNode[]; numbered: boolean }
  | { kind: "paragraph"; children: InlineNode[] }
  | { kind: "list"; ordered: boolean; items: BlockNode[][] }
  | { kind: "quote"; blocks: BlockNode[] }
  | { kind: "code"; text: string; language: string }
  | { kind: "math"; latex: string; display: true }
  | { kind: "unsupported"; command: string; line: number };

export interface Diagnostic {
  line: number;
  command: string;
  message: string;
}

export interface ParseResult {
  blocks: BlockNode[];
  diagnostics: Diagnostic[];
}


/** Text-mode commands the preview can render. Math commands are not listed. */
export const SUPPORTED_TEXT_COMMANDS = new Set([
  "section",
  "subsection",
  "subsubsection",
  "textbf",
  "emph",
  "textit",
  "texttt",
  "underline",
  "item",
  "begin",
  "end",
  "newline",
  "par",
  "today",
  "LaTeX",
  "TeX",
  "ldots",
  "dots",
  "quad",
  "qquad",
  "hspace",
  "vspace",
  "centering",
  "noindent",
  "hfill",
  "clearpage",
  "newpage",
  "tableofcontents",
  "label",
  "caption",
  "includegraphics",
  // escaped characters
  "%",
  "_",
  "&",
  "#",
  "$",
  "{",
  "}",
  "\\",
  " ",
  ",",
  ";",
  ":",
  "!",
]);

const ENVIRONMENTS = new Set([
  "itemize",
  "enumerate",
  "quote",
  "quotation",
  "verbatim",
  "lstlisting",
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "cases",
  "displaymath",
  "math",
]);

export function isSupportedEnvironment(name: string): boolean {
  return ENVIRONMENTS.has(name);
}

/**
 * Strips `%` comments, but not `\%`. Kept line-based so diagnostics can
 * report the original line numbers.
 */
export function stripComment(line: string): string {
  let out = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      out += char + (line[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (char === "%") break;
    out += char;
  }
  return out;
}
