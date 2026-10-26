// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { runSelectionAction } from "../src/components/editorSelectionTools";

/**
 * These exercise the real CodeMirror dispatch path, not just the pure
 * helpers: the floating row's work happens inside `view.dispatch`, and a
 * wrong `from`/`to` here would silently corrupt a document.
 */

const views: EditorView[] = [];

function makeView(doc: string, from: number, to: number): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: from, head: to } }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

function selectedText(view: EditorView): string {
  const range = view.state.selection.main;
  return view.state.sliceDoc(range.from, range.to);
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

describe("runSelectionAction — block toggles", () => {
  it("turns the selected line into a level-two heading and back", () => {
    const view = makeView("标题\n正文", 0, 2);

    runSelectionAction(view, "h2");
    expect(view.state.doc.toString()).toBe("## 标题\n正文");

    runSelectionAction(view, "h2");
    expect(view.state.doc.toString()).toBe("标题\n正文");
  });

  it("prefixes every selected line with a quote marker", () => {
    const view = makeView("第一行\n第二行\n结尾", 0, 7);

    runSelectionAction(view, "quote");

    expect(view.state.doc.toString()).toBe("> 第一行\n> 第二行\n结尾");
  });

  it("does not quote blank lines", () => {
    const view = makeView("甲\n\n乙", 0, 4);

    runSelectionAction(view, "quote");

    expect(view.state.doc.toString()).toBe("> 甲\n\n> 乙");
  });
});

describe("runSelectionAction — link", () => {
  it("wraps the selection and leaves the URL selected", () => {
    const view = makeView("官网在这里", 0, 2);

    runSelectionAction(view, "link");

    expect(view.state.doc.toString()).toBe("[官网](https://)在这里");
    expect(selectedText(view)).toBe("https://");
  });
});

describe("runSelectionAction — inline markers", () => {
  it("bolds, then unboldens the same selection", () => {
    const view = makeView("重点内容", 0, 2);

    runSelectionAction(view, "bold");
    expect(view.state.doc.toString()).toBe("**重点**内容");

    // After wrapping, the selection covers the markers; clicking again strips them.
    runSelectionAction(view, "bold");
    expect(view.state.doc.toString()).toBe("重点内容");
  });

  it("wraps in backticks for inline code", () => {
    const view = makeView("npm run build 方法", 0, 13);

    runSelectionAction(view, "code");

    expect(view.state.doc.toString()).toContain("`npm run build`");
  });
});
