import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Run, TextRun } from "docx";
import { Math as DocxMath, latexToMath } from "docx/math";
import { serializeFormula } from "../core/formula/serializer";
import type { FormulaWrap } from "../core/formula/model";
import { ensureMathJax, isMathJaxReady, texToSvg } from "../core/markdown/mathToSvg";
import { parseLatex } from "../core/latex/parseLatex";
import { renderBlocks } from "../core/latex/render";
import { blocksToDocxParagraphs } from "../core/latex/docx";
import { FORMULA_DRAFT_KEY, parseFormulaDraft, readDraft, writeDraft } from "../core/tools/drafts";
import { CanvasPane } from "./CanvasPane";
import { LatexSymbolPanel } from "./LatexSymbolPanel";
import { WorkspaceSplit } from "./WorkspaceSplit";

interface LatexToolPageProps {
  initialLatex?: string;
}

type PageMode = "fragment" | "document";
type CopyStatus = "idle" | "copied" | "failed";
type DocxStatus = "idle" | "exporting" | "exported" | "failed";

const MODE_KEY = "r2md-latex-mode";

const WRAP_OPTIONS: { id: FormulaWrap; label: string; description: string }[] = [
  { id: "none", label: "无包裹", description: "纯 LaTeX 字符串" },
  { id: "inline", label: "行内 $...$", description: "用于正文段落" },
  { id: "display", label: "块级 $$...$$", description: "独立成段的公式" },
];

const SAMPLE = "\\section{引言}\n这是一段正文，行内公式 $E = mc^2$ 可以混排。\n\n\\begin{itemize}\n\\item 第一点\n\\item 第二点\n\\end{itemize}";

function readMode(): PageMode {
  if (typeof window === "undefined") return "fragment";
  return window.localStorage.getItem(MODE_KEY) === "document" ? "document" : "fragment";
}

function readSvgDimensions(svg: string): { width: number; height: number } {
  const widthMatch = /width="([\d.]+)ex"/.exec(svg);
  const heightMatch = /height="([\d.]+)ex"/.exec(svg);
  const ex = 8;
  return {
    width: widthMatch ? Number(widthMatch[1]) * ex : 320,
    height: heightMatch ? Number(heightMatch[1]) * ex : 80,
  };
}

function svgToPngBlob(svg: string, scale = 2): Promise<{ blob: Blob; width: number; height: number }> {
  const { width: intrinsicW, height: intrinsicH } = readSvgDimensions(svg);
  const width = Math.max(120, Math.round(intrinsicW));
  const height = Math.max(40, Math.round(intrinsicH));

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error("无法创建画布。"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(svgUrl);
        if (!blob) {
          reject(new Error("无法生成 PNG。"));
          return;
        }
        resolve({ blob, width, height });
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("无法加载 SVG 以生成 PNG。"));
    };
    image.src = svgUrl;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function LatexToolPage({ initialLatex = "\\frac{a}{b}" }: LatexToolPageProps) {
  const [latex, setLatex] = useState<string>(
    () => readDraft(FORMULA_DRAFT_KEY, parseFormulaDraft)?.latex ?? initialLatex,
  );
  const [wrap, setWrap] = useState<FormulaWrap>(
    () => readDraft(FORMULA_DRAFT_KEY, parseFormulaDraft)?.wrap ?? "inline",
  );
  const [mode, setMode] = useState<PageMode>(readMode);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [docxStatus, setDocxStatus] = useState<DocxStatus>("idle");
  const [mathReady, setMathReady] = useState(isMathJaxReady());

  const copyTimer = useRef<number | null>(null);
  const docxTimer = useRef<number | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Survives the idle unload of a tool page.
  useEffect(() => {
    writeDraft(FORMULA_DRAFT_KEY, { latex, wrap });
  }, [latex, wrap]);

  useEffect(() => {
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (mathReady) return;
    let cancelled = false;
    void ensureMathJax()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setMathReady(isMathJaxReady());
      });
    return () => {
      cancelled = true;
    };
  }, [mathReady]);

  const output = useMemo(() => serializeFormula({ latex }, wrap), [latex, wrap]);

  const parsed = useMemo(() => parseLatex(latex), [latex]);

  const documentHtml = useMemo(() => {
    if (mode !== "document") return "";
    return renderBlocks(parsed.blocks, {
      math: (expression, display) => {
        if (!mathReady) return null;
        try {
          return texToSvg(expression, { displayMode: display });
        } catch {
          return null;
        }
      },
    });
  }, [mode, parsed.blocks, mathReady]);

  const previewSvg = useMemo(() => {
    if (mode !== "fragment" || !output.bare.trim() || !mathReady) return "";
    try {
      return texToSvg(output.bare, { displayMode: wrap === "display" });
    } catch {
      return "";
    }
  }, [mode, output.bare, wrap, mathReady]);

  const previewError = useMemo(() => {
    if (mode !== "fragment" || !output.bare.trim() || !mathReady) return null;
    try {
      texToSvg(output.bare, { displayMode: wrap === "display" });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "公式无法解析。";
    }
  }, [mode, output.bare, wrap, mathReady]);

  const insertSnippet = (snippet: string) => {
    const view = viewRef.current;
    if (!view) {
      setLatex((current) => current + snippet);
      return;
    }
    const range = view.state.selection.main;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: snippet },
      selection: { anchor: range.from + snippet.length },
    });
    setLatex(view.state.doc.toString());
    view.focus();
  };

  const jumpTo = (line: number) => {
    const view = viewRef.current;
    if (!view) return;
    const target = view.state.doc.line(Math.min(line, view.state.doc.lines));
    view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true });
    view.focus();
  };

  const handleCopy = async () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    const textToCopy = mode === "document" ? latex : output.wrapped;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
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

  /** Mirrors a formula that docx cannot express into an image paragraph. */
  const formulaFallback = async (expression: string): Promise<Paragraph | null> => {
    try {
      const svg = texToSvg(expression, { displayMode: true });
      const { blob, width, height } = await svgToPngBlob(svg);
      const buffer = await blob.arrayBuffer();
      const targetWidth = Math.min(480, width);
      return new Paragraph({
        alignment: "center",
        children: [
          new ImageRun({
            data: buffer,
            transformation: {
              width: targetWidth,
              height: Math.round((targetWidth / width) * height),
            },
            type: "png",
          }),
        ],
      });
    } catch {
      return null;
    }
  };

  const exportFragment = async (): Promise<Paragraph[]> => {
    const children: Paragraph[] = [];
    let usedFallback = false;
    let fallbackError = "";

    try {
      const mathChildren = latexToMath(output.bare);
      children.push(
        new Paragraph({
          alignment: wrap === "inline" ? "left" : "center",
          children: [new Run({ children: [new DocxMath({ children: mathChildren })] })],
        }),
      );
    } catch (error) {
      usedFallback = true;
      fallbackError = error instanceof Error ? error.message : "LaTeX → Word 转换失败。";
      if (previewSvg) {
        const fallback = await formulaFallback(output.bare);
        if (fallback) children.push(fallback);
      }
    }

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "LaTeX 源码" })],
      }),
      new Paragraph({ children: [new TextRun({ text: output.bare, font: "Consolas" })] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "导出说明" })],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: usedFallback
              ? "LaTeX → Word 原生公式转换失败（" +
                fallbackError +
                "），已退化为预览 PNG。建议简化 LaTeX 后重试。"
              : "公式以 Word 原生 OMML 嵌入，可在 Word 中双击编辑；LaTeX 源码以等宽字体保留。",
          }),
        ],
      }),
    );

    return children;
  };

  const handleExportDocx = async () => {
    if (docxTimer.current !== null) window.clearTimeout(docxTimer.current);

    const empty = mode === "document" ? !latex.trim() : !output.bare.trim();
    if (empty) {
      setDocxStatus("failed");
      docxTimer.current = window.setTimeout(() => setDocxStatus("idle"), 1600);
      return;
    }

    setDocxStatus("exporting");
    try {
      const children =
        mode === "document"
          ? await blocksToDocxParagraphs(parsed.blocks, { mathFallback: formulaFallback })
          : await exportFragment();

      const doc = new Document({
        creator: "Baker Writing Studio",
        title: mode === "document" ? "LaTeX 文档" : "公式",
        sections: [{ properties: {}, children }],
      });

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `latex-${Date.now()}.docx`);
      setDocxStatus("exported");
    } catch {
      setDocxStatus("failed");
    }
    docxTimer.current = window.setTimeout(() => setDocxStatus("idle"), 1600);
  };

  const editorExtension = useMemo(() => [EditorView.lineWrapping], []);

  return (
    <WorkspaceSplit
      storageKey="r2md-canvas-latex"
      left={
        <CanvasPane
          side="left"
          title={mode === "document" ? "LaTeX 文档" : "LaTeX 输入"}
          actions={
            <>
              <div className="latex-mode-switch" role="group" aria-label="模式">
                <button
                  type="button"
                  aria-pressed={mode === "fragment"}
                  onClick={() => setMode("fragment")}
                >
                  片段
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "document"}
                  onClick={() => setMode("document")}
                >
                  文档
                </button>
              </div>
              <LatexSymbolPanel onInsert={insertSnippet} />
            </>
          }
        >
          <div className="latex-source">
            <CodeMirror
              value={latex}
              height="100%"
              extensions={editorExtension}
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
              }}
              onChange={setLatex}
              onCreateEditor={(view) => {
                viewRef.current = view;
              }}
              className="latex-editor"
            />
            {mode === "document" && !latex.trim() ? (
              <button type="button" className="latex-sample" onClick={() => setLatex(SAMPLE)}>
                插入示例文档
              </button>
            ) : null}
          </div>

          {mode === "fragment" ? (
            <>
              <h3 className="tool-card-subtitle">包裹方式</h3>
              <div className="tool-radio-group" role="radiogroup" aria-label="包裹方式">
                {WRAP_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`tool-radio${wrap === option.id ? " is-active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="latex-wrap"
                      value={option.id}
                      checked={wrap === option.id}
                      onChange={() => setWrap(option.id)}
                    />
                    <span className="tool-radio-label">{option.label}</span>
                    <span className="tool-radio-description">{option.description}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="latex-diagnostics" aria-live="polite">
              {parsed.diagnostics.length === 0 ? (
                <p className="latex-diagnostics-ok">没有不支持的命令。</p>
              ) : (
                <>
                  <p className="latex-diagnostics-title">
                    {parsed.diagnostics.length} 处需要确认
                  </p>
                  <ul>
                    {parsed.diagnostics.map((item) => (
                      <li key={`${item.line}-${item.command}`}>
                        <button type="button" onClick={() => jumpTo(item.line)}>
                          第 {item.line} 行
                        </button>
                        <code>{item.command}</code>
                        <span>{item.message}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </CanvasPane>
      }
      right={
        <CanvasPane
          side="right"
          title={mode === "document" ? "排版预览" : "结果"}
          padded={false}
          actions={
            <>
              <button
                type="button"
                className="tool-btn tool-btn-primary"
                onClick={handleExportDocx}
                disabled={docxStatus === "exporting"}
                data-status={docxStatus}
              >
                {docxStatus === "exporting"
                  ? "正在转换…"
                  : docxStatus === "exported"
                    ? "已导出 Word"
                    : docxStatus === "failed"
                      ? "导出失败"
                      : mode === "document"
                        ? "转 word"
                        : "转 word"}
              </button>
              <button
                type="button"
                className="tool-btn tool-btn-primary"
                onClick={handleCopy}
                data-status={copyStatus}
              >
                {copyStatus === "copied"
                  ? "已复制"
                  : copyStatus === "failed"
                    ? "复制失败"
                    : "复制 LaTeX"}
              </button>
            </>
          }
        >
          {mode === "document" ? (
            <div className="latex-preview-scroll">
              {latex.trim() ? (
                <article
                  className="latex-preview"
                  dangerouslySetInnerHTML={{ __html: documentHtml }}
                />
              ) : (
                <p className="latex-preview-empty">
                  在左侧输入 LaTeX 文档，例如 \section{'{标题}'} 或 \begin{'{itemize}'}。
                </p>
              )}
            </div>
          ) : (
            <div className="latex-preview-scroll">
              <div className="formula-preview" aria-live="polite">
                {previewSvg ? (
                  <div
                    className="formula-preview-svg"
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
                ) : (
                  <span className="formula-preview-empty">输入 LaTeX 查看预览。</span>
                )}
                {previewError && <p className="formula-preview-error">{previewError}</p>}
              </div>
              <h3 className="tool-card-subtitle">输出</h3>
              <pre className="tool-output-pre">{output.wrapped || "(空)"}</pre>
            </div>
          )}
        </CanvasPane>
      }
    />
  );
}
