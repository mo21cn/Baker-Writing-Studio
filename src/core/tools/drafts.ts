/**
 * Draft persistence for the tool pages.
 *
 * Tool pages are kept mounted for instant switching but unloaded after ten
 * minutes idle; without a draft that unload would silently discard a
 * half-filled table or an unfinished formula. Each page stores a small JSON
 * blob, validated on read so a stale or hand-edited entry cannot crash the
 * page.
 */

import type { FormulaWrap } from "../formula/model";

export interface TableDraft {
  rows: string[][];
  headerRow: boolean;
}

export interface FormulaDraft {
  latex: string;
  wrap: FormulaWrap;
}

export const TABLE_DRAFT_KEY = "r2md-table-draft";
export const FORMULA_DRAFT_KEY = "r2md-formula-draft";

const WRAPS: FormulaWrap[] = ["none", "inline", "display"];
const MAX_ROWS = 200;
const MAX_COLS = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseTableDraft(value: unknown): TableDraft | null {
  if (!isRecord(value)) return null;
  const { rows, headerRow } = value;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) return null;

  const width = Array.isArray(rows[0]) ? rows[0].length : 0;
  if (width === 0 || width > MAX_COLS) return null;

  const normalized: string[][] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) return null;
    normalized.push(
      Array.from({ length: width }, (_, index) => (typeof row[index] === "string" ? row[index] : "")),
    );
  }

  return { rows: normalized, headerRow: headerRow === true };
}

export function parseFormulaDraft(value: unknown): FormulaDraft | null {
  if (!isRecord(value)) return null;
  const { latex, wrap } = value;
  if (typeof latex !== "string" || latex.length > 20000) return null;
  const normalizedWrap = WRAPS.includes(wrap as FormulaWrap) ? (wrap as FormulaWrap) : "inline";
  return { latex, wrap: normalizedWrap };
}

export function readDraft<T>(key: string, parse: (value: unknown) => T | null): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or disabled localStorage must not break typing.
  }
}
