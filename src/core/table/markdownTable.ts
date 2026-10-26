import type { TableModel } from "./model";
import { normalizeTable } from "./model";

export interface MarkdownTable {
  model: TableModel;
}

const ALIGNMENT_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Reads a GFM pipe table back into the grid. The alignment row is metadata,
 * not content, so it is dropped; the model keeps rows and shape only.
 */
export function parseMarkdownTable(input: string): TableModel | null {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return null;

  const header = lines[0];
  if (!ALIGNMENT_RE.test(lines[1])) return null;

  const width = splitRow(header).length;
  if (width === 0) return null;

  const rows = [header, ...lines.slice(2)]
    .map(splitRow)
    .map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));

  return normalizeTable({ cells: rows, cols: width, headerRow: true });
}

/** True when the text looks like exactly one pipe table and nothing else. */
export function looksLikeMarkdownTable(input: string): boolean {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length >= 2 && lines.every((line) => line.includes("|")) && ALIGNMENT_RE.test(lines[1]);
}
