import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  hasPendingMermaidBlocks,
  renderMermaidBlocksWithRetry,
} from "../core/markdown/renderMermaid";
import { applyThemeHtml } from "../core/theme/applyTheme";
import type { ThemeDefinition, ThemeId } from "../core/theme/themes";
import {
  detectDominantLanguage,
  translateMarkdown,
} from "../core/translate/translateMarkdown";
import { useEditorStore } from "../store/editorStore";
import { ThemePanel } from "./ThemePanel";
import { ThemeSelector } from "./ThemeSelector";

interface PreviewPaneProps {
  rawHtml: string;
  theme: ThemeDefinition;
  themeId: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
}

type ExportStatus = "idle" | "exported" | "failed";
type TranslateStatus = "idle" | "translating" | "done" | "failed";

/**
 * Trigger a browser download of `text` as `filename` using Blob + ObjectURL.
 * Adds a UTF-8 BOM so editors that sniff (Excel, Notepad on some locales)
 * detect the encoding correctly.
 */
function downloadTextFile(text: string, filename: string, mime: string) {
  const BOM = "﻿";
  const blob = new Blob([BOM + text], { type: `${mime};charset=utf-8` });
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

/** Sanitize the first `# heading` of a Markdown doc into a filename stem. */
function deriveFileStem(markdown: string): string {
  const heading = /^\s*#\s+(.+?)\s*$/m.exec(markdown);
  const raw = heading ? heading[1] : "";
  const cleaned = raw
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "untitled";
}

export function PreviewPane({ rawHtml, theme, themeId, onThemeChange }: PreviewPaneProps) {
  const { t } = useTranslation();
  const toggleThemePanel = useEditorStore((state) => state.toggleThemePanel);
  const isThemePanelOpen = useEditorStore((state) => state.isThemePanelOpen);
  const markdown = useEditorStore((state) => state.markdown);
  const setMarkdown = useEditorStore((state) => state.setMarkdown);
  const setCopyStatus = useEditorStore((state) => state.setCopyStatus);
  const setWarnings = useEditorStore((state) => state.setWarnings);
  const previewRef = useRef<HTMLDivElement>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [translateStatus, setTranslateStatus] =
    useState<TranslateStatus>("idle");
  const [translateTarget, setTranslateTarget] = useState<"zh" | "en">("zh");

  const themed = applyThemeHtml({
    rawHtml,
    theme,
  });

  useLayoutEffect(() => {
    const container = previewRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;

    const scheduleRender = async () => {
      await renderMermaidBlocksWithRetry(container);
      if (cancelled || !container.isConnected) {
        return;
      }

      if (hasPendingMermaidBlocks(container)) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 200);
        });

        if (!cancelled && container.isConnected) {
          await renderMermaidBlocksWithRetry(container);
        }
      }
    };

    void scheduleRender();

    return () => {
      cancelled = true;
    };
  }, [themed.html, rawHtml]);

  const handleTranslate = async () => {
    if (!markdown.trim()) {
      setCopyStatus("success", t("translate.emptyDocument"));
      return;
    }
    const detected = detectDominantLanguage(markdown);
    const target: TranslateTarget = detected === "zh" ? "en" : "zh";
    setTranslateTarget(target);
    setTranslateStatus("translating");
    setCopyStatus("copying", t("translate.translating"));
    try {
      const result = await translateMarkdown(markdown, target);
      if (result.warnings.length > 0) {
        setWarnings(result.warnings);
      }
      setMarkdown(result.text);
      setTranslateStatus("done");
      setCopyStatus("success", t("translate.success"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTranslateStatus("failed");
      setCopyStatus("error", t("translate.failed", { message }));
    } finally {
      window.setTimeout(() => setTranslateStatus("idle"), 1600);
    }
  };

  const handleExportMarkdown = () => {
    if (!markdown) {
      return;
    }
    try {
      const stem = deriveFileStem(markdown);
      const filename = `${stem}-${Date.now()}.md`;
      downloadTextFile(markdown, filename, "text/markdown");
      setExportStatus("exported");
    } catch {
      setExportStatus("failed");
    }
    window.setTimeout(() => setExportStatus("idle"), 1600);
  };

  return (
    <section className="pane preview-pane" aria-label={t("common.preview")}>
      <div className="pane-header">
        <span>{t("common.preview")}</span>
        <div className="preview-header-actions">
          <button
            type="button"
            className="preview-translate-md"
            onClick={() => void handleTranslate()}
            disabled={translateStatus === "translating" || !markdown}
            data-status={translateStatus}
            title={t("translate.buttonHint")}
          >
            {translateStatus === "translating"
              ? t("translate.translating")
              : translateStatus === "failed"
                ? t("translate.failedShort")
                : translateTarget === "zh"
                  ? t("translate.toEnShort")
                  : t("translate.toZhShort")}
          </button>
          <button
            type="button"
            className="preview-export-md"
            onClick={handleExportMarkdown}
            disabled={!markdown}
            data-status={exportStatus}
            title={t("common.exportMarkdown")}
          >
            {exportStatus === "exported"
              ? t("common.exported")
              : exportStatus === "failed"
                ? t("common.exportFailed")
                : t("common.exportMd")}
          </button>
          <ThemeSelector themeId={themeId} onThemeChange={onThemeChange} />
          <button type="button" className="theme-panel-toggle" onClick={toggleThemePanel}>
            {isThemePanelOpen ? t("preview.collapseTheme") : t("preview.expandTheme")}
          </button>
        </div>
      </div>
      <div className="preview-layout">
        <div className="preview-scroll">
          <style>{themed.css}</style>
          <div
            ref={previewRef}
            className="preview-sheet"
            dangerouslySetInnerHTML={{ __html: themed.html }}
          />
        </div>
        <ThemePanel themeId={themeId} onThemeChange={onThemeChange} />
      </div>
    </section>
  );
}