import { useEffect, useState } from "react";
import { fetchImportUrl } from "../core/import/fetchImportUrl";
import { convertWechatHtmlToMarkdown, type ConvertOptions } from "../core/wechat/tool";
import { CanvasPane } from "./CanvasPane";
import { WorkspaceSplit } from "./WorkspaceSplit";
import { saveText } from "../core/export/saveFile";

type Status = { kind: "idle" | "loading" | "error" | "success"; message: string };

type ExportStatus = "idle" | "exported" | "failed";

/** Sanitize a WeChat article title into a safe filename stem. */
function safeFileStem(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

// Remembering the last URL makes the 
// tool usable across restarts without re-pasting the link.
const WECHAT_URL_KEY = "r2md-wechat-url";

export function WechatToolPage() {
  const [url, setUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(WECHAT_URL_KEY) ?? "";
  });
  const [options, setOptions] = useState<Required<ConvertOptions>>({
    includeTitle: true,
    includeMetadata: true,
  });
  const [markdown, setMarkdown] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WECHAT_URL_KEY, url);
  }, [url]);

  const handleConvert = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "请输入公众号文章 URL。" });
      return;
    }

    setStatus({ kind: "loading", message: "正在抓取文章..." });
    setWarnings([]);
    setMarkdown("");
    setTitle("");

    const fetched = await fetchImportUrl(trimmed);

    if (!fetched.ok) {
      setStatus({ kind: "error", message: fetched.message });
      return;
    }

    try {
      const result = convertWechatHtmlToMarkdown(fetched.html, trimmed, options);
      setMarkdown(result.markdown);
      setTitle(result.title);
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

  const handleExport = async () => {
    if (!markdown) {
      return;
    }
    try {
      const stem = safeFileStem(title, "wechat-article");
      const filename = `${stem}-${Date.now()}.md`;
      const result = await saveText(markdown, {
        filename,
        mime: "text/markdown",
        extension: "md",
      });
      if (result.cancelled) {
        return;
      }
      setExportStatus(result.ok ? "exported" : "failed");
    } catch {
      setExportStatus("failed");
    }
    window.setTimeout(() => setExportStatus("idle"), 1600);
  };

  return (
    <WorkspaceSplit
      storageKey="r2md-canvas-wechat"
      left={
        <CanvasPane side="left" title="输入" meta="公众号 / 通用网页">
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
            {status.kind === "loading" ? "抓取中..." : "转换"}
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
        </CanvasPane>
      }
      right={
        <CanvasPane
          side="right"
          title="Markdown 输出"
          padded={false}
          actions={
            <button
              type="button"
              className="tool-btn tool-btn-primary"
              onClick={handleExport}
              disabled={!markdown}
              data-status={exportStatus}
            >
              {exportStatus === "exported"
                ? "已导出"
                : exportStatus === "failed"
                  ? "导出失败"
                  : "导出 .md"}
            </button>
          }
        >
          <textarea
            className="tool-textarea tool-textarea-output tool-textarea-flush"
            rows={18}
            value={markdown}
            readOnly
            placeholder="Markdown 输出会显示在这里。"
            aria-label="Markdown 输出"
          />
        </CanvasPane>
      }
    />
  );
}
