import { RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { findBlockPreviews, type BlockPreview } from "../core/markdown/blockPreviews";
import hljs from "../core/markdown/highlight";

/**
 * Read-only previews rendered *below* a table or a fenced code block.
 *
 * Like the inline widgets, nothing is replaced: the Markdown source stays
 * on screen and on disk, so line-based translation and export keep seeing
 * exactly what the author typed.
 *
 * Block decorations must come from a StateField — CodeMirror rejects them
 * from a ViewPlugin ("Block decorations may not be specified via
 * plugins"). Rebuilding the whole set on every change is cheap because
 * parsing is line-based and widget DOM is only built for the lines the
 * view actually mounts.
 */

const MAX_CODE_LINES = 40;
const MAX_TABLE_ROWS = 30;

class TableWidget extends WidgetType {
  constructor(readonly preview: Extract<BlockPreview, { kind: "table" }>) {
    super();
  }

  eq(other: TableWidget): boolean {
    return JSON.stringify(other.preview.rows) === JSON.stringify(this.preview.rows);
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-block-preview cm-block-table";

    const label = document.createElement("div");
    label.className = "cm-block-label";
    label.textContent = "表格预览";

    const table = document.createElement("table");
    const [header, ...body] = this.preview.rows;

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    header.forEach((cell, index) => {
      const th = document.createElement("th");
      th.textContent = cell;
      const align = this.preview.alignments[index];
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
        const align = this.preview.alignments[index];
        if (align) td.style.textAlign = align;
        tr.append(td);
      });
      tbody.append(tr);
    }
    table.append(tbody);

    wrap.append(label, table);

    if (body.length > MAX_TABLE_ROWS) {
      const more = document.createElement("div");
      more.className = "cm-block-more";
      more.textContent = `还有 ${body.length - MAX_TABLE_ROWS} 行未显示`;
      wrap.append(more);
    }

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

  const items: Array<{ pos: number; decoration: Decoration }> = [];

  for (const preview of findBlockPreviews(lines)) {
    const pos = doc.line(preview.endLine + 1).to;
    const widget =
      preview.kind === "table"
        ? new TableWidget(preview)
        : new CodeWidget(preview.language, preview.code);

    items.push({ pos, decoration: Decoration.widget({ widget, block: true, side: 1 }) });
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

const blockPreviewField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update: (decorations, transaction) =>
    transaction.docChanged ? buildDecorations(transaction.state) : decorations,
  provide: (field) => EditorView.decorations.from(field),
});

export const blockPreviewWidgets: Extension = blockPreviewField;
