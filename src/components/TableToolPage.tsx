import { useMemo, useRef, useState } from "react";
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
import { serializeTable, type TableFormat } from "../core/table/serializer";

type FormatTab = TableFormat;

const FORMATS: { id: FormatTab; label: string; mime: string }[] = [
  { id: "markdown", label: "Markdown", mime: "text/markdown" },
  { id: "latex", label: "LaTeX", mime: "application/x-latex" },
  { id: "csv", label: "CSV", mime: "text/csv" },
  { id: "html", label: "HTML", mime: "text/html" },
];

interface TableToolPageProps {
  /**
   * When provided, used as the initial model. The page owns its own state after
   * that — the prop is only consulted on first mount so the tool can be wired
   * to a "send to editor" handler in the future without re-creating the table.
   */
  initialModel?: TableModel;
}

export function TableToolPage(_props: TableToolPageProps = {}) {
  const [model, setModel] = useState<TableModel>(() => createEmptyTable(3, 3));
  const [activeFormat, setActiveFormat] = useState<FormatTab>("markdown");
  const [importStatus, setImportStatus] = useState<string>("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<number | null>(null);

  const output = useMemo(() => serializeTable(model, activeFormat), [model, activeFormat]);

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

  const handleCopy = async () => {
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = output;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    copyTimer.current = window.setTimeout(() => setCopyStatus("idle"), 1600);
  };

  return (
    <div className="tool-page tool-page-table">
      <header className="tool-page-header">
        <div>
          <h2>Table Converter</h2>
          <p className="tool-page-subtitle">可视化编辑表格，导出 Markdown / LaTeX / CSV / HTML。</p>
        </div>
        <div className="tool-page-actions">
          <button type="button" className="tool-btn tool-btn-ghost" onClick={handleReset}>
            清空
          </button>
          <button type="button" className="tool-btn tool-btn-ghost" onClick={handleClipboardImport}>
            从剪贴板导入
          </button>
          <button type="button" className="tool-btn tool-btn-ghost" onClick={handleToggleHeader}>
            {model.headerRow ? "取消表头" : "设为表头"}
          </button>
          <button type="button" className="tool-btn tool-btn-primary" onClick={handleAddRow}>
            + 行
          </button>
          <button type="button" className="tool-btn tool-btn-primary" onClick={handleAddColumn}>
            + 列
          </button>
        </div>
      </header>

      <div className="tool-page-grid">
        <section className="tool-card tool-card-editor">
          <h3>可视化编辑器</h3>
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
        </section>

        <section className="tool-card tool-card-output">
          <div className="tool-card-output-header">
            <h3>输出</h3>
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
              <button
                type="button"
                className="tool-btn tool-btn-primary"
                onClick={handleCopy}
                data-status={copyStatus}
              >
                {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制"}
              </button>
            </div>
          </div>
          <pre className="tool-output-pre" aria-live="polite">
            {output || "(空)"}
          </pre>
        </section>
      </div>
    </div>
  );
}
