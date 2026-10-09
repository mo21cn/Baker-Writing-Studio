import { useEffect, useMemo, useRef, useState } from "react";
import { serializeFormula } from "../core/formula/serializer";
import type { FormulaWrap } from "../core/formula/model";
import { texToSvg } from "../core/markdown/mathToSvg";

interface FormulaToolPageProps {
  initialLatex?: string;
}

const WRAP_OPTIONS: { id: FormulaWrap; label: string; description: string }[] = [
  { id: "none", label: "无包裹", description: "纯 LaTeX 字符串" },
  { id: "inline", label: "行内 $...$", description: "用于正文段落" },
  { id: "display", label: "独占 $$...$$", description: "用于独立公式块" },
];

export function FormulaToolPage({ initialLatex = "\\frac{a}{b}" }: FormulaToolPageProps) {
  const [latex, setLatex] = useState<string>(initialLatex);
  const [wrap, setWrap] = useState<FormulaWrap>("inline");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);

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

  return (
    <div className="tool-page tool-page-formula">
      <header className="tool-page-header">
        <div>
          <h2>Formula → LaTeX</h2>
          <p className="tool-page-subtitle">键入 LaTeX 公式，实时预览并复制为可粘贴的片段。</p>
        </div>
      </header>

      <div className="tool-page-grid">
        <section className="tool-card tool-card-editor">
          <h3>LaTeX 源码</h3>
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
        </section>

        <section className="tool-card tool-card-output">
          <div className="tool-card-output-header">
            <h3>预览</h3>
            <button
              type="button"
              className="tool-btn tool-btn-primary"
              onClick={handleCopy}
              data-status={copyStatus}
            >
              {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制 LaTeX"}
            </button>
          </div>
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
        </section>
      </div>
    </div>
  );
}
