import type { EditorView } from "@codemirror/view";
import { planInsert, type InsertKind, type InsertPlan } from "./insertSnippets";

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

/** Context for replacing an explicit range, e.g. the `/表格` token. */
export function insertContextForRange(view: EditorView, from: number, to: number) {
  const line = view.state.doc.lineAt(from);
  return {
    selection: "",
    contentBefore: line.text.slice(0, from - line.from).trim().length > 0,
    contentAfter: line.text.slice(to - line.from).trim().length > 0,
  };
}

function dispatchPlan(
  view: EditorView,
  plan: InsertPlan,
  from: number,
  to: number,
): void {
  view.dispatch({
    changes: { from, to, insert: plan.text },
    selection: plan.select
      ? { anchor: from + plan.select.from, head: from + plan.select.to }
      : { anchor: from + (plan.cursorOffset ?? plan.text.length) },
    scrollIntoView: true,
  });
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

  dispatchPlan(view, plan, replaces ? range.from : range.to, range.to);
}

/** Replaces a slash token (the `/表格` the author typed) with its insert. */
export function applySlashInsert(
  view: EditorView,
  kind: InsertKind,
  from: number,
  to: number,
): void {
  const plan = planInsert(kind, insertContextForRange(view, from, to));
  dispatchPlan(view, plan, from, to);
}
