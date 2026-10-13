import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandLogo, BrandWordmark } from "./BrandLogo";
import { copyHtml } from "../core/copy/copyHtml";
import { exportLongImage } from "../core/export/exportLongImage";
import { buildWechatOutput } from "../core/platform/wechatAdapter";
import { renderMarkdown } from "../core/markdown/renderMarkdown";
import { getActiveTheme } from "../core/theme/themes";
import { translateMarkdown } from "../core/translate/translateMarkdown";
import { useEditorStore } from "../store/editorStore";

interface ToolbarProps {
  markdownValue: string;
  onMarkdownChange?: (next: string) => void;
}

export function Toolbar({ markdownValue, onMarkdownChange }: ToolbarProps) {
  const { t } = useTranslation();
  const activeDocId = useEditorStore((state) => state.activeDocId);
  const themeId = useEditorStore((state) => state.themeId);
  const customThemeTokens = useEditorStore((state) => state.customThemeTokens);
  const customThemeName = useEditorStore((state) => state.customThemeName);
  const copyStatus = useEditorStore((state) => state.copyStatus);
  const statusMessage = useEditorStore((state) => state.statusMessage);
  const warnings = useEditorStore((state) => state.warnings);
  const setCopyStatus = useEditorStore((state) => state.setCopyStatus);
  const setWarnings = useEditorStore((state) => state.setWarnings);

  const [exportStatus, setExportStatus] = useState<"idle" | "exporting">("idle");
  const [translateStatus, setTranslateStatus] = useState<"idle" | "translating">("idle");
  const [lastTranslateTarget, setLastTranslateTarget] = useState<"zh" | "en" | null>(null);
  const [copyDialog, setCopyDialog] = useState<{
    title: string;
    message: string;
    warnings: string[];
    tone: "success" | "error";
  } | null>(null);

  const handleTranslate = async (target: "zh" | "en") => {
    if (!onMarkdownChange) return;
    if (!markdownValue.trim()) {
      setCopyStatus("success", t("translate.emptyDocument"));
      return;
    }
    setTranslateStatus("translating");
    setCopyStatus("copying", t("translate.translating"));
    try {
      const result = await translateMarkdown(markdownValue, target);
      if (result.warnings.length > 0) {
        setWarnings(result.warnings);
      }
      onMarkdownChange(result.text);
      setLastTranslateTarget(target);
      setCopyStatus(
        result.warnings.length > 0 ? "success" : "success",
        t("translate.success"),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCopyStatus("error", t("translate.failed", { message }));
    } finally {
      setTranslateStatus("idle");
    }
  };

  const handleExportLongImage = async () => {
    if (!markdownValue.trim()) {
      return;
    }

    setExportStatus("exporting");
    setCopyStatus("copying", t("toolbar.generatingLongImage"));

    try {
      const activeDoc = useEditorStore.getState().documents.find((doc) => doc.id === activeDocId);
      const result = await exportLongImage({
        markdown: markdownValue,
        theme: getActiveTheme(themeId, customThemeTokens, customThemeName),
        docId: activeDocId,
        title: activeDoc?.title,
      });

      setWarnings(result.warnings);
      const message = result.ok ? t("export.success") : result.message || t("export.failed");
      setCopyStatus(result.ok ? "success" : "error", message);
      if (!result.ok) {
        setCopyDialog({
          title: t("toolbar.exportFailed"),
          message,
          warnings: result.warnings,
          tone: "error",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("export.failed");
      setWarnings([message]);
      setCopyStatus("error", message);
      setCopyDialog({
        title: t("toolbar.exportFailed"),
        message,
        warnings: [message],
        tone: "error",
      });
    } finally {
      setExportStatus("idle");
    }
  };

  const handleCopyWechat = async () => {
    setCopyStatus("copying", t("toolbar.generatingWechat"));

    try {
      const rendered = renderMarkdown({
        markdown: markdownValue,
      });
      const output = await buildWechatOutput({
        rawHtml: rendered.rawHtml,
        theme: getActiveTheme(themeId, customThemeTokens, customThemeName),
        warnings: rendered.warnings,
        docId: activeDocId,
      });
      const result = await copyHtml(output);
      const hasWarnings = output.warnings.length > 0;
      const resultTitle = result.ok
        ? hasWarnings
          ? t("toolbar.copySuccessWithWarnings")
          : t("toolbar.copySuccess")
        : t("toolbar.copyFailed");
      const resultMessage =
        result.ok && hasWarnings
          ? t("toolbar.copySuccessWithWarningsMessage", { message: result.message })
          : result.message;

      setWarnings(output.warnings);
      setCopyStatus(result.ok ? "success" : "error", resultMessage);
      setCopyDialog({
        title: resultTitle,
        message: resultMessage,
        warnings: output.warnings,
        tone: result.ok ? "success" : "error",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("export.copyPermissionFailed");
      setWarnings([message]);
      setCopyStatus("error", message);
      setCopyDialog({
        title: t("toolbar.copyFailed"),
        message,
        warnings: [message],
        tone: "error",
      });
    }
  };

  return (
    <header className="toolbar toolbar-app">
      <div className="toolbar-brand">
        <div className="brand-logo-wrap" aria-hidden>
          <BrandLogo />
        </div>
        <div className="toolbar-brand-text">
          <BrandWordmark />
          <span className="toolbar-subtitle">{t("toolbar.subtitle")}</span>
        </div>
      </div>

      <div className="toolbar-center">
        {!copyDialog && statusMessage && (
          <span className={`toolbar-status status-${copyStatus}`} role="status">
            {statusMessage}
          </span>
        )}
        {!copyDialog && warnings.length > 0 && (
          <span className="toolbar-warning">{warnings[0]}</span>
        )}
      </div>

      <div className="toolbar-actions toolbar-actions-compact">
        <div
          className="toolbar-lang-switch"
          role="group"
          aria-label={t("translate.toolbarGroupLabel")}
          title={t("translate.languageSwitchHint")}
        >
          <button
            type="button"
            className={`toolbar-lang-option${lastTranslateTarget === "zh" ? " is-active" : ""}`}
            aria-pressed={lastTranslateTarget === "zh"}
            disabled={translateStatus === "translating"}
            onClick={() => void handleTranslate("zh")}
            title={t("translate.toZhTitle")}
          >
            中文
          </button>
          <button
            type="button"
            className={`toolbar-lang-option${lastTranslateTarget === "en" ? " is-active" : ""}`}
            aria-pressed={lastTranslateTarget === "en"}
            disabled={translateStatus === "translating"}
            onClick={() => void handleTranslate("en")}
            title={t("translate.toEnTitle")}
          >
            English
          </button>
        </div>
        <button
          type="button"
          className="toolbar-btn toolbar-btn-ghost toolbar-btn-export"
          title={t("toolbar.exportLongImage")}
          disabled={exportStatus === "exporting" || !markdownValue.trim()}
          onClick={() => void handleExportLongImage()}
        >
          {exportStatus === "exporting" ? t("toolbar.exporting") : t("toolbar.exportLongImage")}
        </button>
        <button
          className="toolbar-btn toolbar-btn-primary toolbar-btn-copy"
          type="button"
          onClick={handleCopyWechat}
          disabled={copyStatus === "copying"}
        >
          {copyStatus === "copying" ? t("toolbar.copying") : t("toolbar.copyWechat")}
        </button>
      </div>

      {copyDialog && (
        <div className="copy-dialog-backdrop" role="presentation">
          <div className={`copy-dialog copy-dialog-${copyDialog.tone}`} role="alertdialog" aria-modal="true">
            <div className="copy-dialog-header">
              <h2>{copyDialog.title}</h2>
              <button type="button" aria-label={t("common.close")} onClick={() => setCopyDialog(null)}>
                ×
              </button>
            </div>
            <p>{copyDialog.message}</p>
            {copyDialog.warnings.length > 0 && (
              <ul>
                {copyDialog.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </header>
  );
}