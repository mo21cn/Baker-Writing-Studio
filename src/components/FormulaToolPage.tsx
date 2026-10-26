import { useEffect, useMemo, useRef, useState } from "react";
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Run, TextRun } from "docx";
import { Math as DocxMath, latexToMath } from "docx/math";
import {
  FORMULA_DRAFT_KEY,
  parseFormulaDraft,
  readDraft,
  writeDraft,
} from "../core/tools/drafts";
import { serializeFormula } from "../core/formula/serializer";
import type { FormulaWrap } from "../core/formula/model";
import { texToSvg } from "../core/markdown/mathToSvg";
import { CanvasPane } from "./CanvasPane";
import { WorkspaceSplit } from "./WorkspaceSplit";

interface FormulaToolPageProps {
  initialLatex?: string;
}

const WRAP_OPTIONS: { id: FormulaWrap; label: string; description: string }[] = [
  { id: "none", label: "无包裹", description: "纯 LaTeX 字符串" },
  { id: "inline", label: "行内 $...$", description: "用于正文段落" },
  { id: "display", label: "独占 $$...$$", description: "用于独立公式块" },
];

type CopyStatus = "idle" | "copied" | "failed";
type DocxStatus = "idle" | "exporting" | "exported" | "failed";

/** Trigger a browser download of a binary Blob as `filename`. */
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

/**
 * Parse the MathJax SVG string and read its declared width/height. We need the
 * intrinsic size so the exported PNG is sharp on the page and the docx image
 * can be scaled without artifacts.
 */
function readSvgDimensions(svg: string): { width: number; height: number } {
  const match = /<svg[^>]*\bwidth="([^"]+)"[^>]*\bheight="([^"]+)"/.exec(svg);
  if (!match) {
    return { width: 240, height: 60 };
  }
  const parse = (raw: string): number => {
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (/ex$/.test(raw)) {
      return value * 8;
    }
    if (/em$/.test(raw)) {
      return value * 16;
    }
    return value;
  };
  return { width: parse(match[1]), height: parse(match[2]) };
}

/**
 * Convert a MathJax SVG string to a PNG blob by rasterising through a
 * canvas. Used as a fallback when `latexToMath` cannot parse the input.
 */
async function svgToPngBlob(svg: string, scale = 2): Promise<{ blob: Blob; width: number; height: number }> {
  const { width: intrinsicW, height: intrinsicH } = readSvgDimensions(svg);
  const width = Math.max(120, Math.round(intrinsicW));
  const height = Math.max(40, Math.round(intrinsicH));

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("无法加载 SVG 以生成 PNG。"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("当前环境不支持 Canvas，无法生成 PNG。");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png");
    });
    if (!blob) {
      throw new Error("Canvas 转 PNG 失败。");
    }
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function FormulaToolPage({ initialLatex = "\\frac{a}{b}" }: FormulaToolPageProps) {
  const [latex, setLatex] = useState<string>(
    () => readDraft(FORMULA_DRAFT_KEY, parseFormulaDraft)?.latex ?? initialLatex,
  );
  const [wrap, setWrap] = useState<FormulaWrap>(
    () => readDraft(FORMULA_DRAFT_KEY, parseFormulaDraft)?.wrap ?? "inline",
  );
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [docxStatus, setDocxStatus] = useState<DocxStatus>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);
  const docxTimer = useRef<number | null>(null);

  // Survives the idle unload of a tool page.
  useEffect(() => {
    writeDraft(FORMULA_DRAFT_KEY, { latex, wrap });
  }, [latex, wrap]);

  const output = useMemo(() => serializeFormula({ latex }, wrap), [latex, wrap]);
  const previewSvg = useMemo(() => {
    if (!output.bare.trim()) {
      return "";
    }
    try {
      return texToSvg(output.bare, { displayMode: wrap === "display" });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "无法渲染该 LaTeX。");
      return "";
    }
  }, [output.bare, wrap]);

  useEffect(() => {
    setPreviewError(null);
  }, [output.bare, wrap]);

  const handleCopy = async () => {
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output.wrapped);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = output.wrapped;
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

  const handleExportDocx = async () => {
    if (docxTimer.current !== null) {
      window.clearTimeout(docxTimer.current);
    }
    if (!output.bare.trim()) {
      setDocxStatus("failed");
      docxTimer.current = window.setTimeout(() => setDocxStatus("idle"), 1600);
      return;
    }

    setDocxStatus("exporting");
    try {
      const children: Paragraph[] = [];
      let usedFallback = false;
      let fallbackError = "";

      // Primary path: Word-native OMML formula via docx/math.latexToMath.
      // This avoids Word treating `$...$` as an auto math field and gives the
      // user a fully editable equation object inside Word.
      try {
        const mathChildren = latexToMath(output.bare);
        const inline = wrap === "inline";
        children.push(
          new Paragraph({
            alignment: inline ? "left" : "center",
            children: [
              new Run({
                children: [new DocxMath({ children: mathChildren })],
              }),
            ],
          }),
        );
      } catch (primaryError) {
        usedFallback = true;
        fallbackError =
          primaryError instanceof Error ? primaryError.message : "LaTeX → Word 转换失败。";
        // Fallback: rasterise the MathJax SVG preview and embed as PNG. The
        // user still gets a docx with the rendered formula visible.
        if (previewSvg) {
          const { blob, width, height } = await svgToPngBlob(previewSvg);
          const buffer = await blob.arrayBuffer();
          const targetWidth = Math.min(480, width);
          const targetHeight = Math.round((targetWidth / width) * height);
          children.push(
            new Paragraph({
              alignment: "center",
              children: [
                new ImageRun({
                  data: buffer,
                  transformation: { width: targetWidth, height: targetHeight },
                  type: "png",
                }),
              ],
            }),
          );
        }
      }

      // Include the raw LaTeX as a code-style paragraph so users can copy it
      // back into Word's equation editor. Crucially we DO NOT use `$...$` in
      // a regular TextRun — Word would auto-convert that into an inline math
      // field, which is the "变形" the previous implementation suffered from.
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "LaTeX 源码" })],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: output.bare,
              font: "Consolas",
            }),
          ],
        }),
      );

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "导出说明" })],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: usedFallback
                ? "LaTeX → Word 原生公式转换失败（" + fallbackError + "），已退化为预览 PNG。建议简化 LaTeX 后重试。LaTeX 源码以等宽字体段落保留，可直接复制到 Word 的 MathType / Equation Editor。"
                : "本文件由 Baker Writing Studio 的 Formula 工具导出。公式以 Word 原生 OMML 嵌入，可在 Word 中双击编辑；LaTeX 源码以等宽字体段落保留。",
            }),
          ],
        }),
      );

      const doc = new Document({
        creator: "Baker Writing Studio",
        title: "公式",
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({ text: "公式" })],
              }),
              ...children,
            ],
          },
        ],
      });

      const docxBlob = await Packer.toBlob(doc);
      const filename = `formula-${Date.now()}.docx`;
      downloadBlob(docxBlob, filename);
      setDocxStatus("exported");
    } catch {
      setDocxStatus("failed");
    }
    docxTimer.current = window.setTimeout(() => setDocxStatus("idle"), 1600);
  };

  return (
    <WorkspaceSplit
      storageKey="r2md-canvas-formula"
      left={
        <CanvasPane side="left" title="LaTeX 输入">
          <textarea
            className="tool-textarea tool-textarea-code"
            rows={4}
            value={latex}
            spellCheck={false}
            onChange={(event) => setLatex(event.target.value)}
            placeholder="例如：\frac{a}{b}"
            aria-label="LaTeX 源码"
          />

          <h3 className="tool-card-subtitle">包裹方式</h3>
          <div className="tool-radio-group" role="radiogroup" aria-label="包裹方式">
            {WRAP_OPTIONS.map((option) => (
              <label
                key={option.id}
                className={`tool-radio${wrap === option.id ? " is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="formula-wrap"
                  value={option.id}
                  checked={wrap === option.id}
                  onChange={() => setWrap(option.id)}
                />
                <span className="tool-radio-label">{option.label}</span>
                <span className="tool-radio-description">{option.description}</span>
              </label>
            ))}
          </div>
        </CanvasPane>
      }
      right={
        <CanvasPane
          side="right"
          title="结果"
          actions={
            <>
              <button
                type="button"
                className="tool-btn tool-btn-primary"
                onClick={handleExportDocx}
                disabled={docxStatus === "exporting" || !previewSvg}
                data-status={docxStatus}
              >
                {docxStatus === "exporting"
                  ? "正在转换…"
                  : docxStatus === "exported"
                    ? "已导出 Word"
                    : docxStatus === "failed"
                      ? "导出失败"
                      : "转 word"}
              </button>
              <button
                type="button"
                className="tool-btn tool-btn-primary"
                onClick={handleCopy}
                data-status={copyStatus}
              >
                {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制 LaTeX"}
              </button>
            </>
          }
        >
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
        </CanvasPane>
      }
    />
  );
}
