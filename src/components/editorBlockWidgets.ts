import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { findBlockPreviews, type BlockPreview } from "../core/markdown/blockPreviews";
import hljs from "../core/markdown/highlight";

/**
 * Read-only previews rendered *below* a table or a fenced code block.
 *
 * Like the inline widgets, nothing is replaced: the Markdown source stays on
 * screen and on disk, so line-based translation and export keep seeing
 * exactly what the author typed.
 *
 * Tables can additionally collapse their source, because a wrapped table row
 * is unreadable in a narrow column — the `|` separators end up at the start
 * of visual lines. Collapsing only hides the source; it is never rewritten.
 *
 * Block decorations must come from a StateField — CodeMirror rejects them
 * from a ViewPlugin ("Block decorations may not be specified via plugins").
 */

const MAX_CODE_LINES = 40;
const MAX_TABLE_ROWS = 30;

type TablePreview = Extract<BlockPreview, { kind: "table" }>;

interface FoldRange {
  from: number;
  to: number;
}

const toggleTableFold = StateEffect.define<FoldRange>();

const foldedTables = StateField.define<readonly FoldRange[]>({
  create: () => [],
  update(ranges, transaction) {
    let next = ranges
      .map((range) => ({
        from: transaction.changes.mapPos(range.from, 1),
        to: transaction.changes.mapPos(range.to, -1),
      }))
      .filter((range) => range.to > range.from);

    for (const effect of transaction.effects) {
      if (!effect.is(toggleTableFold)) continue;
      const target = effect.value;
      const existing = next.findIndex(
        (range) => range.from === target.from && range.to === target.to,
      );
      next = existing >= 0 ? next.filter((_, index) => index !== existing) : [...next, target];
    }

    return next;
  },
});

function isFolded(state: EditorState, range: FoldRange): boolean {
  return state
    .field(foldedTables)
    .some((entry) => entry.from === range.from && entry.to === range.to);
}

function actionButton(view: EditorView, range: FoldRange, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-block-action";
  button.textContent = label;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    view.dispatch({ effects: toggleTableFold.of(range) });
    view.focus();
  });
  return button;
}

function tableLabel(text: string, view?: EditorView, range?: FoldRange, action?: string) {
  const label = document.createElement("div");
  label.className = "cm-block-label";
  label.append(document.createTextNode(text));
  if (view && range && action) label.append(actionButton(view, range, action));
  return label;
}

function renderTable(preview: TablePreview): HTMLElement[] {
  const table = document.createElement("table");
  const [header, ...body] = preview.rows;

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  header.forEach((cell, index) => {
    const th = document.createElement("th");
    th.textContent = cell;
    const align = preview.alignments[index];
    if (align) th.style.textAlign = align;
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  for (const row of body.slice(0, MAX_TABLE_ROWS)) {
    const tr = document.createElement("tr");
    header.forEach((_, index) => {
      const td = document.createElement("td");
      td.textContent = row[index] ?? "";
      const align = preview.alignments[index];
      if (align) td.style.textAlign = align;
      tr.append(td);
    });
    tbody.append(tr);
  }
  table.append(tbody);

  const parts: HTMLElement[] = [table];

  if (body.length > MAX_TABLE_ROWS) {
    const more = document.createElement("div");
    more.className = "cm-block-more";
    more.textContent = `还有 ${body.length - MAX_TABLE_ROWS} 行未显示`;
    parts.push(more);
  }

  return parts;
}

class TableWidget extends WidgetType {
  constructor(
    readonly preview: TablePreview,
    readonly range: FoldRange,
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return (
      other.range.from === this.range.from &&
      JSON.stringify(other.preview.rows) === JSON.stringify(this.preview.rows)
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-block-preview cm-block-table";
    wrap.append(tableLabel("表格预览", view, this.range, "折叠源码"), ...renderTable(this.preview));
    return wrap;
  }
}

/** Rendered in place of a folded table's source lines. */
class FoldedTableWidget extends WidgetType {
  constructor(
    readonly preview: TablePreview,
    readonly range: FoldRange,
  ) {
    super();
  }

  eq(other: FoldedTableWidget): boolean {
    return (
      other.range.from === this.range.from &&
      JSON.stringify(other.preview.rows) === JSON.stringify(this.preview.rows)
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-block-preview cm-block-table cm-block-folded";
    wrap.append(tableLabel("表格源码已折叠", view, this.range, "展开源码"), ...renderTable(this.preview));
    return wrap;
  }
}

class CodeWidget extends WidgetType {
  constructor(
    readonly language: string,
    readonly code: string,
  ) {
    super();
  }

  eq(other: CodeWidget): boolean {
    return other.language === this.language && other.code === this.code;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-block-preview cm-block-code";

    const label = document.createElement("div");
    label.className = "cm-block-label";
    label.textContent = this.language ? `代码预览 · ${this.language}` : "代码预览";

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const lines = this.code.split("\n");
    const shown = lines.slice(0, MAX_CODE_LINES).join("\n");

    if (this.language && hljs.getLanguage(this.language)) {
      // hljs escapes its input, so the highlighted markup is safe to inject.
      code.innerHTML = hljs.highlight(shown, {
        language: this.language,
        ignoreIllegals: true,
      }).value;
    } else {
      code.textContent = shown;
    }
    code.className = "hljs";

    pre.append(code);
    wrap.append(label, pre);

    if (lines.length > MAX_CODE_LINES) {
      const more = document.createElement("div");
      more.className = "cm-block-more";
      more.textContent = `还有 ${lines.length - MAX_CODE_LINES} 行未显示`;
      wrap.append(more);
    }

    return wrap;
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const lines: string[] = [];
  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    lines.push(doc.line(lineNo).text);
  }

  const items: Array<{ from: number; to: number; decoration: Decoration }> = [];

  for (const preview of findBlockPreviews(lines)) {
    const startPos = doc.line(preview.startLine + 1).from;
    const endPos = doc.line(preview.endLine + 1).to;

    if (preview.kind === "table") {
      const range: FoldRange = { from: startPos, to: endPos };

      if (isFolded(state, range)) {
        items.push({
          from: startPos,
          to: endPos,
          decoration: Decoration.replace({
            block: true,
            widget: new FoldedTableWidget(preview, range),
          }),
        });
        continue;
      }

      items.push({
        from: endPos,
        to: endPos,
        decoration: Decoration.widget({
          widget: new TableWidget(preview, range),
          block: true,
          side: 1,
        }),
      });
      continue;
    }

    items.push({
      from: endPos,
      to: endPos,
      decoration: Decoration.widget({
        widget: new CodeWidget(preview.language, preview.code),
        block: true,
        side: 1,
      }),
    });
  }

  items.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  let lastFrom = -1;
  let lastTo = -1;
  for (const item of items) {
    if (item.from === lastFrom && item.to === lastTo) continue;
    builder.add(item.from, item.to, item.decoration);
    lastFrom = item.from;
    lastTo = item.to;
  }
  return builder.finish();
}

const blockPreviewField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update: (decorations, transaction) =>
    transaction.docChanged || transaction.effects.some((effect) => effect.is(toggleTableFold))
      ? buildDecorations(transaction.state)
      : decorations,
  provide: (field) => EditorView.decorations.from(field),
});

export const blockPreviewWidgets: Extension = [foldedTables, blockPreviewField];
