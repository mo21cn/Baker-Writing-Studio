/**
 * A tiny history for the LaTeX page's fragment mode.
 *
 * Five entries, deduplicated by the LaTeX text, newest first. Persisted in
 * localStorage; anything unreadable is dropped rather than shown.
 */

const HISTORY_KEY = "r2md-formula-history";
const MAX_HISTORY = 5;

export interface FormulaHistoryEntry {
  latex: string;
  wrap: "none" | "inline" | "display";
}

export function readFormulaHistory(): FormulaHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is FormulaHistoryEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as FormulaHistoryEntry).latex === "string" &&
        ((entry as FormulaHistoryEntry).latex?.trim().length ?? 0) > 0 &&
        ["none", "inline", "display"].includes((entry as FormulaHistoryEntry).wrap),
    );
  } catch {
    return [];
  }
}

/** Adds an entry at the front, deduplicating by LaTeX text. */
export function pushFormulaHistory(latex: string, wrap: FormulaHistoryEntry["wrap"]): void {
  const trimmed = latex.trim();
  if (!trimmed) return;

  const next = [
    { latex: trimmed, wrap },
    ...readFormulaHistory().filter((entry) => entry.latex !== trimmed),
  ].slice(0, MAX_HISTORY);

  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Quota problems must not break copying.
  }
}
