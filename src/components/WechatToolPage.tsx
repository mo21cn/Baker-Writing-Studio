import { useState } from "react";
import { fetchImportUrl } from "../core/import/fetchImportUrl";
import { convertWechatHtmlToMarkdown, type ConvertOptions } from "../core/wechat/tool";

type Status = { kind: "idle" | "loading" | "error" | "success"; message: string };

export function WechatToolPage() {
  const [url, setUrl] = useState<string>("");
  const [options, setOptions] = useState<Required<ConvertOptions>>({
    includeTitle: true,
    includeMetadata: true,
  });
  const [markdown, setMarkdown] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleConvert = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "请输入公众号文章 URL。" });
      return;
    }

    setStatus({ kind: "loading", message: "正在抓取文章..." });
    setWarnings([]);
    setMarkdown("");

    const fetched = await fetchImportUrl(trimmed);

    if (!fetched.ok) {
      setStatus({ kind: "error", message: fetched.message });
      return;
    }

    try {
      const result = convertWechatHtmlToMarkdown(fetched.html, trimmed, options);
      setMarkdown(result.markdown);
      setWarnings([]);
      setStatus({
        kind: "success",
        message: `已生成 ${result.markdown.length} 字符的 Markdown。`,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "解析失败。",
      });
    }
  };

  const handleCopy = async () => {
    if (!markdown) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = markdown;
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
    window.setTimeout(() => setCopyStatus("idle"), 1600);
  };

  return (
    <div className="tool-page tool-page-wechat">
      <header className="tool-page-header">
        <div>
          <h2>WeChat → Markdown</h2>
          <p className="tool-page-subtitle">输入公众号文章 URL，抓取并转换为 Markdown。</p>
        </div>
      </header>

      <div className="tool-page-grid">
        <section className="tool-card tool-card-editor">
          <h3>输入</h3>
          <label className="tool-field">
            <span>文章 URL</span>
            <input
              type="url"
              value={url}
              placeholder="https://mp.weixin.qq.com/s/..."
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleConvert();
                }
              }}
            />
          </label>

          <div className="tool-checkbox-group">
            <label className="tool-checkbox">
              <input
                type="checkbox"
                checked={options.includeTitle}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, includeTitle: event.target.checked }))
                }
              />
              <span>添加标题</span>
            </label>
            <label className="tool-checkbox">
              <input
                type="checkbox"
                checked={options.includeMetadata}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, includeMetadata: event.target.checked }))
                }
              />
              <span>添加元数据（作者 / 发布时间 / 原文链接）</span>
            </label>
          </div>

          <button
            type="button"
            className="tool-btn tool-btn-primary tool-btn-convert"
            onClick={handleConvert}
            disabled={status.kind === "loading"}
          >
            {status.kind === "loading" ? "抓取中..." : "Convert"}
          </button>

          {status.kind !== "idle" && (
            <p
              className={`tool-page-status tool-page-status-${status.kind}`}
              role={status.kind === "error" ? "alert" : "status"}
            >
              {status.message}
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="tool-page-warnings">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="tool-card tool-card-output">
          <div className="tool-card-output-header">
            <h3>Markdown 输出</h3>
            <button
              type="button"
              className="tool-btn tool-btn-primary"
              onClick={handleCopy}
              disabled={!markdown}
              data-status={copyStatus}
            >
              {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制"}
            </button>
          </div>
          <textarea
            className="tool-textarea tool-textarea-output"
            rows={18}
            value={markdown}
            readOnly
            placeholder="Markdown 输出会显示在这里。"
            aria-label="Markdown 输出"
          />
        </section>
      </div>
    </div>
  );
}
