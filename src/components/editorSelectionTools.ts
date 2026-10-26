import { EditorView } from "@codemirror/view";

/**
 * Selection-driven formatting for the editor's floating row.
 *
 * The editor has no toolbar, so bold/italic/code only exist while text is
 * selected. Everything here is a plain function over the view so the React
 * overlay stays free of CodeMirror state.
 */

export type WrapKind = "bold" | "italic" | "code";

const MARKERS: Record<WrapKind, string> = {
  bold: "**",
  italic: "*",
  code: "`",
};

export const WRAP_LABELS: Record<WrapKind, { label: string; title: string }> = {
  bold: { label: "B", title: "加粗（**文字**）" },
  italic: { label: "I", title: "斜体（*文字*）" },
  code: { label: "</>", title: "行内代码（`文字`）" },
};

function isWrapped(text: string, marker: string, from: number, to: number, doc: string): boolean {
  const before = doc.slice(Math.max(0, from - marker.length), from);
  const after = doc.slice(to, to + marker.length);
  if (before === marker && after === marker) return true;
  return text.length > marker.length * 2 && text.startsWith(marker) && text.endsWith(marker);
}

/** Adds the marker around the selection, or removes it when already applied. */
export function toggleWrap(view: EditorView, kind: WrapKind): void {
  const marker = MARKERS[kind];
  const range = view.state.selection.main;
  if (range.empty) return;

  const doc = view.state.doc.toString();
  const text = view.state.sliceDoc(range.from, range.to);

  if (isWrapped(text, marker, range.from, range.to, doc)) {
    if (text.startsWith(marker) && text.endsWith(marker)) {
      const inner = text.slice(marker.length, text.length - marker.length);
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: inner },
        selection: { anchor: range.from, head: range.from + inner.length },
      });
      return;
    }

    view.dispatch({
      changes: [
        { from: range.from - marker.length, to: range.from, insert: "" },
        { from: range.to, to: range.to + marker.length, insert: "" },
      ],
      selection: { anchor: range.from - marker.length, head: range.to - marker.length },
    });
    return;
  }

  const wrapped = `${marker}${text}${marker}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: wrapped },
    selection: { anchor: range.from, head: range.from + wrapped.length },
  });
}

export interface BubblePosition {
  top: number;
  left: number;
}

/**
 * Where to draw the row for the current selection, or null when it must not
 * be shown (no selection, no focus, or the selection scrolled out of view).
 */
export function bubblePosition(view: EditorView): BubblePosition | null {
  const range = view.state.selection.main;
  if (range.empty) return null;

  // `view.hasFocus` is false whenever the webview itself lacks focus, so ask
  // the DOM instead.
  if (!view.dom.contains(document.activeElement)) return null;

  const start = view.coordsAtPos(range.from);
  const end = view.coordsAtPos(range.to);
  if (!start || !end) return null;

  const width = 96;
  const height = 30;
  const center = (start.left + end.right) / 2;
  const left = Math.min(window.innerWidth - width - 8, Math.max(8, center - width / 2));
  const top = Math.max(8, start.top - height - 6);

  return { top, left };
}
