import { useMemo, useRef, useState, useEffect } from "react";
import {
  addColumn,
  addRow,
  createEmptyTable,
  removeColumn,
  removeRow,
  setCell,
  type TableModel,
} from "../core/table/model";
import { parseClipboardTable } from "../core/table/parser";
import { looksLikeMarkdownTable, parseMarkdownTable } from "../core/table/markdownTable";
import { serializeTable, type TableFormat } from "../core/table/serializer";
import {
  TABLE_DRAFT_KEY,
  parseTableDraft,
  readDraft,
  writeDraft,
} from "../core/tools/drafts";
import { useEditorStore } from "../store/editorStore";
import { CanvasPane } from "./CanvasPane";
import { WorkspaceSplit } from "./WorkspaceSplit";
import { saveText } from "../core/export/saveFile";

type FormatTab = TableFormat;

const FORMATS: { id: FormatTab; label: string; mime: string; extension: string }[] = [
  { id: "markdown", label: "Markdown", mime: "text/markdown", extension: "md" },
  { id: "latex", label: "LaTeX", mime: "application/x-latex", extension: "tex" },
  { id: "csv", label: "CSV", mime: "text/csv", extension: "csv" },
  { id: "html", label: "HTML", mime: "text/html", extension: "html" },
];

type ExportStatus = "idle" | "exported" | "failed";

interface TableToolPageProps {
  /**
   * When provided, used as the initial model. The page owns its own state after
   * that — the prop is only consulted on first mount so the tool can be wired
   * to a "send to editor" handler in the future without re-creating the table.
   */
  initialModel?: TableModel;
}

export function TableToolPage(_props: TableToolPageProps = {}) {
  const documents = useEditorStore((state) => state.documents);
  const activeDocId = useEditorStore((state) => state.activeDocId);
  const setStoreMarkdown = useEditorStore((state) => state.setMarkdown);
  const createTypedDocument = useEditorStore((state) => state.createTypedDocument);
  const activeTableDoc = documents.find(
    (doc) => doc.id === activeDocId && doc.source === "table",
  );

  // A table-source document owns the grid; without one the page keeps
  // its standalone draft.
  const [draftModel, setDraftModel] = useState<TableModel>(() => {
    const draft = readDraft(TABLE_DRAFT_KEY, parseTableDraft);
    if (!draft) return createEmptyTable(3, 3);
    return {
      cells: draft.rows,
      cols: draft.rows[0]?.length ?? 3,
      headerRow: draft.headerRow,
    };
  });
  const model = useMemo(() => {
    if (activeTableDoc && looksLikeMarkdownTable(activeTableDoc.markdown)) {
      return parseMarkdownTable(activeTableDoc.markdown) ?? draftModel;
    }
    return draftModel;
  }, [activeTableDoc, draftModel]);
  const setModel = (next: TableModel | ((current: TableModel) => TableModel)) => {
    const resolved = typeof next === "function" ? next(model) : next;
    setDraftModel(resolved);
    if (activeTableDoc) setStoreMarkdown(serializeTable(resolved, "markdown"));
  };
  const [activeFormat, setActiveFormat] = useState<FormatTab>("markdown");
  const [importStatus, setImportStatus] = useState<string>("");
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const exportTimer = useRef<number | null>(null);

  // Survives the idle unload of a tool page. Table-source documents
  // autosave through the store instead.
  useEffect(() => {
    if (activeTableDoc) return;
    writeDraft(TABLE_DRAFT_KEY, { rows: model.cells, headerRow: model.headerRow });
  }, [model, activeTableDoc]);

  const output = useMemo(() => serializeTable(model, activeFormat), [model, activeFormat]);

  const handleSaveAsTableDocument = () => {
    const markdown = serializeTable(model, "markdown");
    createTypedDocument("table", markdown, "表格文档");
  };

  const updateCell = (row: number, col: number, value: string) => {
    setModel((current) => setCell(current, row, col, value));
  };

  const handleAddRow = () => {
    setModel((current) => addRow(current));
  };

  const handleAddColumn = () => {
    setModel((current) => addColumn(current));
  };

  const handleRemoveRow = (row: number) => {
    setModel((current) => removeRow(current, row));
  };

  const handleRemoveColumn = (col: number) => {
    setModel((current) => removeColumn(current, col));
  };

  const handleToggleHeader = () => {
    setModel((current) => ({ ...current, headerRow: !current.headerRow }));
  };

  const handleReset = () => {
    setModel(createEmptyTable(3, 3));
    setImportStatus("已重置为空白表格。");
  };

  const handleClipboardImport = async () => {
    setImportStatus("");
    if (!navigator.clipboard?.readText) {
      setImportStatus("当前环境不允许读取剪贴板。请手动粘贴后点击「从文本导入」。");
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseClipboardTable(text);
      setModel(parsed);
      setImportStatus(`已从剪贴板导入 ${parsed.cells.length} 行 × ${parsed.cols} 列。`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "读取剪贴板失败。");
    }
  };

  const handleTextImport = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = event.target.value;
    if (!text.trim()) {
      return;
    }
    const parsed = parseClipboardTable(text);
    setModel(parsed);
    setImportStatus(`已从文本导入 ${parsed.cells.length} 行 × ${parsed.cols} 列。`);
  };

  const activeFormatMeta = FORMATS.find((format) => format.id === activeFormat);

  const handleExport = async () => {
    if (!output || !activeFormatMeta) {
      return;
    }
    if (exportTimer.current !== null) {
      window.clearTimeout(exportTimer.current);
    }
    try {
      const filename = `table-${Date.now()}.${activeFormatMeta.extension}`;
      const result = await saveText(output, {
        filename,
        mime: activeFormatMeta.mime,
        extension: activeFormatMeta.extension,
      });
      if (result.cancelled) {
        return;
      }
      setExportStatus(result.ok ? "exported" : "failed");
    } catch {
      setExportStatus("failed");
    }
    exportTimer.current = window.setTimeout(() => setExportStatus("idle"), 1600);
  };

  return (
    <WorkspaceSplit
      storageKey="r2md-canvas-table"
      left={
        <CanvasPane
          side="left"
          title="表格"
          meta={`${model.cells.length} × ${model.cols}`}
          actions={
            <>
              <button type="button" className="tool-btn" onClick={handleAddRow}>
                + 行
              </button>
              <button type="button" className="tool-btn" onClick={handleAddColumn}>
                + 列
              </button>
            </>
          }
        >
          <div className="tool-row">
            <button type="button" className="tool-btn tool-btn-ghost" onClick={handleSaveAsTableDocument}>
              保存为文档
            </button>
            <button type="button" className="tool-btn tool-btn-ghost" onClick={handleReset}>
              清空
            </button>
            <button type="button" className="tool-btn tool-btn-ghost" onClick={handleClipboardImport}>
              从剪贴板导入
            </button>
            <button type="button" className="tool-btn tool-btn-ghost" onClick={handleToggleHeader}>
              {model.headerRow ? "取消表头" : "设为表头"}
            </button>
          </div>

          <div className="table-editor-wrap">
            <table className="table-editor">
              <thead>
                <tr>
                  <th aria-hidden className="table-editor-corner"></th>
                  {Array.from({ length: model.cols }, (_, col) => (
                    <th key={col} scope="col" className="table-editor-col-head">
                      <span>列 {col + 1}</span>
                      {model.cols > 1 && (
                        <button
                          type="button"
                          className="table-editor-remove"
                          aria-label={`删除第 ${col + 1} 列`}
                          onClick={() => handleRemoveColumn(col)}
                        >
                          ×
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.cells.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <th scope="row" className="table-editor-row-head">
                      <span>行 {rowIndex + 1}</span>
                      {model.cells.length > 1 && (
                        <button
                          type="button"
                          className="table-editor-remove"
                          aria-label={`删除第 ${rowIndex + 1} 行`}
                          onClick={() => handleRemoveRow(rowIndex)}
                        >
                          ×
                        </button>
                      )}
                    </th>
                    {Array.from({ length: model.cols }, (_, col) => {
                      const isHeaderCell = model.headerRow && rowIndex === 0;
                      return (
                        <td key={col} className={isHeaderCell ? "table-editor-cell-head" : undefined}>
                          <input
                            type="text"
                            value={row[col] ?? ""}
                            onChange={(event) => updateCell(rowIndex, col, event.target.value)}
                            aria-label={`第 ${rowIndex + 1} 行 第 ${col + 1} 列`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="tool-page-collapsible">
            <summary>从文本导入（TSV / CSV / HTML）</summary>
            <textarea
              className="tool-textarea"
              rows={4}
              placeholder="从 Excel / Numbers / 浏览器复制后粘贴到这里，自动识别格式。"
              onChange={handleTextImport}
            />
          </details>
          {importStatus && <p className="tool-page-status">{importStatus}</p>}
        </CanvasPane>
      }
      right={
        <CanvasPane
          side="right"
          title="输出"
          padded={false}
          actions={
            <>
              <div className="tool-format-tabs" role="tablist" aria-label="输出格式">
                {FORMATS.map((format) => (
                  <button
                    key={format.id}
                    type="button"
                    role="tab"
                    aria-selected={activeFormat === format.id}
                    className={`tool-format-tab${activeFormat === format.id ? " is-active" : ""}`}
                    onClick={() => setActiveFormat(format.id)}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="tool-btn tool-btn-primary"
                onClick={handleExport}
                disabled={!output}
                data-status={exportStatus}
              >
                {exportStatus === "exported"
                  ? "已导出"
                  : exportStatus === "failed"
                    ? "导出失败"
                    : `导出 .${activeFormatMeta?.extension ?? ""}`}
              </button>
            </>
          }
        >
          <pre className="tool-output-pre tool-output-pre-flush" aria-live="polite">
            {output || "(空)"}
          </pre>
        </CanvasPane>
      }
    />
  );
}
