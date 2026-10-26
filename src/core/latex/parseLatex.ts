import {
  isSupportedEnvironment,
  stripComment,
  SUPPORTED_TEXT_COMMANDS,
  type BlockNode,
  type Diagnostic,
  type InlineNode,
  type ParseResult,
} from "./model";

/**
 * Line-based reader for the LaTeX subset the page can render.
 *
 * Recursive descent over blocks, with inline parsing per paragraph. Every
 * unknown text-mode command becomes a diagnostic instead of disappearing.
 */

interface Cursor {
  lines: string[];
  index: number;
  /** Raw (uncommented) lines, needed for verbatim bodies. */
  raw: string[];
  diagnostics: Diagnostic[];
}

const MATH_ENVS = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "cases",
  "displaymath",
]);

/** Joins wrapped source lines; renderers substitute a space for it. */
const SEP = "\u0001";

const LIST_ENVS = new Set(["itemize", "enumerate"]);

const ESCAPES: Record<string, string> = {
  "%": "%",
  _: "_",
  "&": "&",
  "#": "#",
  $: "$",
  "{": "{",
  "}": "}",
  "\\": "\n",
  " ": " ",
  ",": " ",
  ";": " ",
  ":": " ",
  "!": "",
  "~": " ",
};

const SYMBOLS: Record<string, string> = {
  ldots: "…",
  dots: "…",
  LaTeX: "LaTeX",
  TeX: "TeX",
  quad: " ",
  qquad: " ",
  newline: "\n",
  par: "\n\n",
  today: new Date().toISOString().slice(0, 10),
  hfill: "",
  noindent: "",
  centering: "",
};

function diagnostic(cursor: Cursor, line: number, command: string, message: string) {
  cursor.diagnostics.push({ line, command, message });
}

/** Reads a braced group starting at `start` (which must be `{`). */
function readGroup(source: string, start: number): { body: string; end: number } | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return { body: source.slice(start + 1, index), end: index + 1 };
    }
  }
  return null;
}

function readCommand(source: string, start: number): { name: string; end: number } {
  let index = start + 1;
  let name = "";
  while (index < source.length && /[a-zA-Z]/.test(source[index])) {
    name += source[index];
    index += 1;
  }
  if (name === "") {
    // single-character command such as \\ or \%
    name = source[index] ?? "";
    index += 1;
  }
  return { name, end: index };
}

function parseInline(text: string, startLine: number, diagnostics: Diagnostic[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  let index = 0;

  const lineAt = (position: number) =>
    startLine + (text.slice(0, position).split(SEP).length - 1);

  const flush = () => {
    if (buffer) {
      nodes.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  while (index < text.length) {
    const char = text[index];

    // inline math: $...$ or \(...\)
    if (char === "$" && text[index + 1] === "$") {
      const close = text.indexOf("$$", index + 2);
      if (close > 0) {
        flush();
        nodes.push({ kind: "math", latex: text.slice(index + 2, close), display: false });
        index = close + 2;
        continue;
      }
    }

    if (char === "$") {
      const close = text.indexOf("$", index + 1);
      if (close > 0) {
        flush();
        nodes.push({ kind: "math", latex: text.slice(index + 1, close), display: false });
        index = close + 1;
        continue;
      }
    }

    if (char === "\\" && text[index + 1] === "(") {
      const close = text.indexOf("\\)", index + 2);
      if (close > 0) {
        flush();
        nodes.push({ kind: "math", latex: text.slice(index + 2, close), display: false });
        index = close + 2;
        continue;
      }
    }

    if (char === "\\") {
      const command = readCommand(text, index);
      const name = command.name;

      if (name in ESCAPES) {
        buffer += ESCAPES[name];
        index = command.end;
        continue;
      }

      if (name in SYMBOLS) {
        buffer += SYMBOLS[name];
        index = command.end;
        continue;
      }

      const wrapped =
        name === "textbf" || name === "emph" || name === "textit" ||
        name === "texttt" || name === "underline"
          ? readGroup(text, command.end)
          : null;

      if (wrapped) {
        flush();
        const children = parseInline(wrapped.body, lineAt(index), diagnostics);
        if (name === "texttt") {
          nodes.push({
            kind: "code",
            text: children.map((child) => ("text" in child ? child.text : "")).join(""),
          });
        } else if (name === "emph" || name === "textit") {
          nodes.push({ kind: "emph", children });
        } else {
          nodes.push({ kind: "strong", children });
        }
        index = wrapped.end;
        continue;
      }

      if (!SUPPORTED_TEXT_COMMANDS.has(name)) {
        diagnostics.push({
          line: lineAt(index),
          command: `\\${name}`,
          message: `不支持的命令 \\${name}`,
        });
        // Kept in the stream and marked, so the preview can point at it.
        flush();
        nodes.push({ kind: "unsupported", command: `\\${name}` });
        index = command.end;
        continue;
      }

      index = command.end;
      continue;
    }

    if (char === "~") {
      buffer += "\u00a0";
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return nodes;
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Reads to the matching `\end{name}`, returning the raw body lines. */
function collectEnvironment(cursor: Cursor, name: string): string[] {
  const body: string[] = [];
  while (cursor.index < cursor.lines.length) {
    const line = cursor.lines[cursor.index];
    if (line.trim().startsWith(`\\end{${name}}`)) {
      cursor.index += 1;
      return body;
    }
    body.push(cursor.raw[cursor.index]);
    cursor.index += 1;
  }
  diagnostic(cursor, cursor.index, `\\begin{${name}}`, `环境 ${name} 没有闭合`);
  return body;
}

function parseList(cursor: Cursor, name: string, startLine: number): BlockNode {
  const ordered = name === "enumerate";
  const items: BlockNode[][] = [];
  let current: BlockNode[] = [];
  let buffer: string[] = [];
  let bufferLine = startLine;

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    current.push({
      kind: "paragraph",
      children: parseInline(buffer.join(SEP), bufferLine, cursor.diagnostics),
    });
    buffer = [];
  };

  while (cursor.index < cursor.lines.length) {
    const line = cursor.lines[cursor.index];
    const trimmed = line.trim();

    if (trimmed.startsWith(`\\end{${name}}`)) {
      cursor.index += 1;
      break;
    }

    if (trimmed.startsWith("\\item")) {
      flushParagraph();
      if (current.length > 0 || items.length > 0) items.push(current);
      current = [];
      bufferLine = cursor.index + 1;
      const rest = trimmed.slice(5).trim().replace(/^\[[^\]]*\]/, "").trim();
      if (rest) buffer.push(rest);
      cursor.index += 1;
      continue;
    }

    const nested = /^\\begin\{(itemize|enumerate)\}/.exec(trimmed);
    if (nested) {
      flushParagraph();
      cursor.index += 1;
      current.push(parseList(cursor, nested[1], cursor.index));
      continue;
    }

    if (isBlank(line)) {
      flushParagraph();
      cursor.index += 1;
      continue;
    }

    if (buffer.length === 0) bufferLine = cursor.index + 1;
    buffer.push(trimmed);
    cursor.index += 1;
  }

  flushParagraph();
  if (current.length > 0 || items.length === 0) items.push(current);

  return { kind: "list", ordered, items };
}

function parseQuote(cursor: Cursor, name: string): BlockNode {
  const body: string[] = [];
  const rawBody: string[] = [];
  while (cursor.index < cursor.lines.length) {
    const line = cursor.lines[cursor.index];
    if (line.trim().startsWith(`\\end{${name}}`)) {
      cursor.index += 1;
      break;
    }
    body.push(line);
    rawBody.push(cursor.raw[cursor.index]);
    cursor.index += 1;
  }

  const inner = parseBody({ lines: body, raw: rawBody, index: 0, diagnostics: cursor.diagnostics });
  return { kind: "quote", blocks: inner.blocks };
}

function parseBody(cursor: Cursor): ParseResult {
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];
  let paragraphLine = cursor.index + 1;

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      kind: "paragraph",
      children: parseInline(paragraph.join(SEP), paragraphLine, cursor.diagnostics),
    });
    paragraph = [];
  };

  while (cursor.index < cursor.lines.length) {
    const raw = cursor.raw[cursor.index];
    const line = cursor.lines[cursor.index];
    const trimmed = line.trim();
    const lineNo = cursor.index + 1;

    if (isBlank(line)) {
      flush();
      cursor.index += 1;
      continue;
    }

    // display math: \[ ... \], $$ ... $$
    if (trimmed.startsWith("\\[") || trimmed.startsWith("$$")) {
      flush();
      const closer = trimmed.startsWith("\\[") ? "\\]" : "$$";
      const opener = trimmed.startsWith("\\[") ? "\\[" : "$$";
      const body = trimmed.slice(opener.length);
      const sameLine = body.indexOf(closer);
      if (sameLine >= 0) {
        blocks.push({ kind: "math", latex: body.slice(0, sameLine), display: true });
        cursor.index += 1;
        continue;
      }
      const collected: string[] = body ? [body] : [];
      cursor.index += 1;
      while (cursor.index < cursor.lines.length) {
        const next = cursor.lines[cursor.index];
        const close = next.indexOf(closer);
        if (close >= 0) {
          collected.push(next.slice(0, close));
          cursor.index += 1;
          break;
        }
        collected.push(next);
        cursor.index += 1;
      }
      blocks.push({ kind: "math", latex: collected.join("\n").trim(), display: true });
      continue;
    }

    // environments
    const begin = /^\\begin\{([^}]+)\}/.exec(trimmed);
    if (begin) {
      flush();
      const name = begin[1];
      cursor.index += 1;

      if (LIST_ENVS.has(name)) {
        blocks.push(parseList(cursor, name, lineNo));
        continue;
      }
      if (name === "quote" || name === "quotation") {
        blocks.push(parseQuote(cursor, name));
        continue;
      }
      if (name === "verbatim" || name === "lstlisting") {
        const body = collectEnvironment(cursor, name);
        blocks.push({ kind: "code", text: body.join("\n"), language: "" });
        continue;
      }
      if (MATH_ENVS.has(name)) {
        const body = collectEnvironment(cursor, name);
        blocks.push({ kind: "math", latex: body.join("\n").trim(), display: true });
        continue;
      }

      const body = collectEnvironment(cursor, name);
      diagnostic(cursor, lineNo, `\\begin{${name}}`, `不支持的环境 ${name}`);
      blocks.push({ kind: "unsupported", command: `\\begin{${name}}`, line: lineNo });
      if (body.length > 0) {
        blocks.push({
          kind: "paragraph",
          children: parseInline(body.join(SEP), lineNo, cursor.diagnostics),
        });
      }
      continue;
    }

    // headings
    const heading = /^\\(section|subsection|subsubsection)(\*?)\s*\{/.exec(trimmed);
    if (heading) {
      flush();
      const group = readGroup(trimmed, trimmed.indexOf("{"));
      const level = heading[1] === "section" ? 1 : heading[1] === "subsection" ? 2 : 3;
      blocks.push({
        kind: "heading",
        level,
        numbered: heading[2] !== "*",
        children: parseInline(group?.body ?? "", lineNo, cursor.diagnostics),
      });
      cursor.index += 1;
      continue;
    }

    if (!isSupportedEnvironment(begin?.[1] ?? "")) {
      // fallthrough handled above
    }

    if (paragraph.length === 0) paragraphLine = lineNo;
    paragraph.push(trimmed);
    cursor.index += 1;
    void raw;
  }

  flush();
  return { blocks, diagnostics: cursor.diagnostics };
}

export function parseLatex(source: string): ParseResult {
  const raw = source.split(/\r?\n/);
  const lines = raw.map((line) => stripComment(line));

  // Skip a preamble so pasted real documents do not explode into warnings.
  const documentStart = lines.findIndex((line) => line.trim().startsWith("\\begin{document}"));
  const start = documentStart >= 0 ? documentStart + 1 : 0;
  const end = lines.findIndex((line) => line.trim().startsWith("\\end{document}"));

  const body = lines.slice(start, end >= 0 ? end : undefined);
  const bodyRaw = raw.slice(start, end >= 0 ? end : undefined);

  const cursor: Cursor = { lines: body, raw: bodyRaw, index: 0, diagnostics: [] };
  const result = parseBody(cursor);

  if (documentStart >= 0) {
    result.diagnostics.unshift({
      line: 1,
      command: "\\documentclass",
      message: "前言区已跳过（本页只预览正文）",
    });
  }

  result.diagnostics.sort((a, b) => a.line - b.line);
  return result;
}
