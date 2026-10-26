/**
 * Locates `$...$` formulas and `![alt](src)` images inside a line of
 * Markdown so the editor can show a preview next to them.
 *
 * Pure on purpose: the CodeMirror widget layer only needs the offsets,
 * and keeping the scanning rules here makes them testable without a DOM.
 */

export type InlinePreview =
  | { kind: "math"; from: number; to: number; latex: string }
  | { kind: "image"; from: number; to: number; alt: string; src: string };

const MATH_PATTERN = /\$([^$\n]{1,160})\$/g;
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const FENCE_PATTERN = /^\s*(?:```|~~~)/;

/** Fenced code blocks are literal text; previews inside them would lie. */
export function isFenceLine(line: string): boolean {
  return FENCE_PATTERN.test(line);
}

export function scanInlinePreviews(text: string): InlinePreview[] {
  const found: InlinePreview[] = [];

  for (const match of text.matchAll(MATH_PATTERN)) {
    const start = match.index ?? 0;

    // `$$ ... $$` is display math and `\$` is a literal dollar; neither
    // should produce an inline preview.
    if (text[start - 1] === "\\" || text[start - 1] === "$") continue;
    if (text[start + match[0].length] === "$") continue;

    found.push({
      kind: "math",
      from: start,
      to: start + match[0].length,
      latex: match[1],
    });
  }

  for (const match of text.matchAll(IMAGE_PATTERN)) {
    const start = match.index ?? 0;
    found.push({
      kind: "image",
      from: start,
      to: start + match[0].length,
      alt: match[1],
      src: match[2],
    });
  }

  return found.sort((a, b) => a.from - b.from);
}
