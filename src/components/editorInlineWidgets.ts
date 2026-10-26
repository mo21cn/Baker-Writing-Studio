import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { isFenceLine, scanInlinePreviews } from "../core/markdown/inlinePreviews";
import { texToSvg } from "../core/markdown/mathToSvg";

/**
 * Inline previews for formulas and images.
 *
 * These sit *after* the source rather than replacing it, so the document
 * stays plain Markdown — every downstream consumer (line-based
 * translation, WeChat copy, export) still sees the original text. That is
 * the difference between this and a rich-text engine.
 */

class MathWidget extends WidgetType {
  constructor(readonly latex: string) {
    super();
  }

  eq(other: MathWidget): boolean {
    return other.latex === this.latex;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-inline-math";
    span.title = `$${this.latex}$`;
    try {
      span.innerHTML = texToSvg(this.latex, { displayMode: false });
    } catch {
      span.textContent = `$${this.latex}$`;
    }
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly src: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-inline-image";

    if (/^https?:\/\//i.test(this.src)) {
      const img = document.createElement("img");
      img.src = this.src;
      img.alt = this.alt;
      img.loading = "lazy";
      const label = document.createElement("span");
      label.textContent = this.alt || "图片";
      wrap.append(img, label);
      return wrap;
    }

    const name = this.src.split(/[/:]/).pop() || "图片";
    wrap.textContent = `🖼 ${this.alt || name}`;
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function decorateLine(line: string, lineFrom: number, items: Array<{ pos: number; decoration: Decoration }>) {
  if (isFenceLine(line)) return;

  for (const preview of scanInlinePreviews(line)) {
    const pos = lineFrom + preview.to;
    const widget =
      preview.kind === "math"
        ? new MathWidget(preview.latex)
        : new ImageWidget(preview.alt, preview.src);
    items.push({ pos, decoration: Decoration.widget({ widget, side: 1 }) });
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const items: Array<{ pos: number; decoration: Decoration }> = [];

  for (const range of view.visibleRanges) {
    let lineNo = view.state.doc.lineAt(range.from).number;
    const lastLine = view.state.doc.lineAt(range.to).number;

    for (; lineNo <= lastLine; lineNo += 1) {
      const line = view.state.doc.line(lineNo);
      decorateLine(line.text, line.from, items);
    }
  }

  items.sort((a, b) => a.pos - b.pos);

  const builder = new RangeSetBuilder<Decoration>();
  let lastPos = -1;
  for (const item of items) {
    if (item.pos === lastPos) continue;
    builder.add(item.pos, item.pos, item.decoration);
    lastPos = item.pos;
  }
  return builder.finish();
}

export const inlinePreviewWidgets: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);
