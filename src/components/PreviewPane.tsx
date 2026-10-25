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
  isAbortError,
  translateMarkdown,
  type TranslateProgress,
  type TranslateTarget,
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

/**
 * Snapshot of the document as it was before the last translation, so a
 * single click can put it back. Keyed by document: switching documents
 * must not offer to revert the new one with the old one's text.
 */
interface TranslationSnapshot {
  docId: string | null;
  original: string;
  translated: string;
  target: TranslateTarget;
}

/**
 * Trigger a browser download of `text` as `filename` using Blob + ObjectURL.
 * Adds a UTF-8 BOM so editors that sniff (Excel, Notepad on some locales)
 * detect the encoding correctly.
 */
function downloadTextFile(text: string, filename: string, mime: string) {
  const BOM = "\uFEFF";
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
  const activeDocId = useEditorStore((state) => state.activeDocId);
  const setMarkdown = useEditorStore((state) => state.setMarkdown);
  const setCopyStatus = useEditorStore((state) => state.setCopyStatus);
  const setWarnings = useEditorStore((state) => state.setWarnings);
  const previewRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState<TranslateProgress | null>(null);
  const [snapshot, setSnapshot] = useState<TranslationSnapshot | null>(null);

  // Derived, not state: the label must always name the language the
  // next click would produce, even before the first click.
  const translateTarget: TranslateTarget =
    markdown.trim() && detectDominantLanguage(markdown) === "zh" ? "en" : "zh";
  const translating = progress !== null;

  // Only offer "revert" while the editor still holds exactly what the
  // translation produced; once the user edits, the snapshot is stale
  // and restoring it would silently discard their work.
  const canRevert =
    snapshot !== null &&
    snapshot.docId === activeDocId &&
    snapshot.translated === markdown;

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

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: 0 });
    setCopyStatus("copying", t("translate.translating"));

    try {
      const result = await translateMarkdown(markdown, translateTarget, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setMarkdown(result.text);
      setSnapshot({
        docId: activeDocId,
        original: markdown,
        translated: result.text,
        target: translateTarget,
      });
      setWarnings(result.warnings);
      setCopyStatus(
        "success",
        result.stats.dropped > 0
          ? t("translate.successWithDropped", {
              count: result.stats.dropped,
              defaultValue: "翻译完成，已去除 {{count}} 行对照重复",
            })
          : t("translate.success"),
      );
    } catch (error) {
      if (isAbortError(error)) {
        setCopyStatus("success", t("translate.cancelled"));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setCopyStatus("error", t("translate.failed", { message }));
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleRevert = () => {
    if (!snapshot) return;
    setMarkdown(snapshot.original);
    setSnapshot(null);
    setWarnings([]);
    setCopyStatus("success", t("translate.reverted"));
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

  const translateLabel = () => {
    if (translating) {
      const done = progress?.done ?? 0;
      const total = progress?.total ?? 0;
      return total > 0
        ? t("translate.progress", { done, total, defaultValue: "翻译中 {{done}}/{{total}}" })
        : t("translate.translating");
    }
    return translateTarget === "zh"
      ? t("translate.toZhShort")
      : t("translate.toEnShort");
  };

  return (
    <section className="pane preview-pane" aria-label={t("common.preview")}>
      <div className="pane-header">
        <span>{t("common.preview")}</span>
        <div className="preview-header-actions">
          {canRevert ? (
            <button
              type="button"
              className="preview-translate-md"
              onClick={handleRevert}
              title={t("translate.revertHint")}
            >
              {t("translate.revert")}
            </button>
          ) : (
            <button
              type="button"
              className="preview-translate-md"
              onClick={() => void handleTranslate()}
              disabled={translating || !markdown}
              data-status={translating ? "translating" : "idle"}
              title={t("translate.buttonHint")}
            >
              {translateLabel()}
            </button>
          )}
          {translating && (
            <button type="button" className="preview-translate-cancel" onClick={handleCancel}>
              {t("translate.cancel")}
            </button>
          )}
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
