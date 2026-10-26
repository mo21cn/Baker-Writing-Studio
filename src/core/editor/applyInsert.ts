import type { EditorView } from "@codemirror/view";
import { planInsert, type InsertKind } from "./insertSnippets";

/**
 * Reads the caret's surroundings so `planInsert` can decide on blank lines
 * and on wrapping the current selection.
 */
export function insertContextAt(view: EditorView) {
  const state = view.state;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const selection = state.sliceDoc(range.from, range.to);

  return {
    selection,
    contentBefore: line.text.slice(0, range.from - line.from).trim().length > 0,
    contentAfter: line.text.slice(range.to - line.from).trim().length > 0,
  };
}

/**
 * Applies an insert plan at the caret and leaves the right thing selected.
 *
 * A link replaces the selection because the selected words become its
 * label; every other insert lands after the selection so the author's text
 * survives.
 */
export function applyInsert(view: EditorView, kind: InsertKind): void {
  const plan = planInsert(kind, insertContextAt(view));
  const range = view.state.selection.main;
  const replaces = kind === "link";
  const from = replaces ? range.from : range.to;
  const to = range.to;

  view.dispatch({
    changes: { from, to, insert: plan.text },
    selection: plan.select
      ? { anchor: from + plan.select.from, head: from + plan.select.to }
      : { anchor: from + (plan.cursorOffset ?? plan.text.length) },
    scrollIntoView: true,
  });
}
