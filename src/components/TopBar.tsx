import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandLogo, hasCustomBrandLogo, writeBrandLogo } from "./BrandLogo";
import type { AppView } from "./ActivityRail";
import { copyHtml } from "../core/copy/copyHtml";
import { exportLongImage } from "../core/export/exportLongImage";
import { ensureMathJax } from "../core/markdown/mathToSvg";
import { renderMarkdown } from "../core/markdown/renderMarkdown";
import { buildWechatOutput } from "../core/platform/wechatAdapter";
import { getActiveTheme } from "../core/theme/themes";
import { useEditorStore } from "../store/editorStore";

const VIEW_LABELS: Record<AppView, string> = {
  editor: "编辑器",
  wechat: "WeChat → Markdown",
  table: "Table Converter",
  formula: "Formula → LaTeX",
};

interface TopBarProps {
  markdownValue: string;
  view: AppView;
  previewVisible: boolean;
  onTogglePreview: () => void;
}

/**
 * One 48px bar: brand, where you are, what you are editing, and the two
 * global actions. Transient state (saved / translating / copied) lives
 * in the status bar instead.
 */
export function TopBar({ markdownValue, view, previewVisible, onTogglePreview }: TopBarProps) {
  const { t } = useTranslation();
  const documents = useEditorStore((state) => state.documents);
  const activeDocId = useEditorStore((state) => state.activeDocId);
  const themeId = useEditorStore((state) => state.themeId);
  const customThemeTokens = useEditorStore((state) => state.customThemeTokens);
  const customThemeName = useEditorStore((state) => state.customThemeName);
  const copyStatus = useEditorStore((state) => state.copyStatus);
  const setCopyStatus = useEditorStore((state) => state.setCopyStatus);
  const setWarnings = useEditorStore((state) => state.setWarnings);

  const [exportStatus, setExportStatus] = useState<"idle" | "exporting">("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [customLogo, setCustomLogo] = useState(hasCustomBrandLogo);
  const [copyDialog, setCopyDialog] = useState<{
    title: string;
    message: string;
    warnings: string[];
    tone: "success" | "error";
  } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeDoc = documents.find((doc) => doc.id === activeDocId);
  const docTitle = activeDoc?.title ?? "未命名文档";

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleLogoFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCopyStatus("error", "Logo 需要是图片文件");
      return;
    }
    if (file.size > 400 * 1024) {
      setCopyStatus("error", "Logo 建议小于 400 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        writeBrandLogo(reader.result);
        setCustomLogo(true);
        setMenuOpen(false);
        setCopyStatus("success", "Logo 已更新");
      }
    };
    reader.readAsDataURL(file);
  };

  const resetLogo = () => {
    writeBrandLogo(null);
    setCustomLogo(false);
    setMenuOpen(false);
    setCopyStatus("success", "已恢复默认 Logo");
  };

  const handleExportLongImage = async () => {
    if (!markdownValue.trim()) return;

    setExportStatus("exporting");
    setCopyStatus("copying", t("toolbar.generatingLongImage"));

    try {
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
        setCopyDialog({ title: t("toolbar.exportFailed"), message, warnings: result.warnings, tone: "error" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("export.failed");
      setWarnings([message]);
      setCopyStatus("error", message);
      setCopyDialog({ title: t("toolbar.exportFailed"), message, warnings: [message], tone: "error" });
    } finally {
      setExportStatus("idle");
    }
  };

  const handleCopyWechat = async () => {
    setCopyStatus("copying", t("toolbar.generatingWechat"));

    try {
      await ensureMathJax();
      const rendered = renderMarkdown({ markdown: markdownValue });
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
      setCopyDialog({ title: resultTitle, message: resultMessage, warnings: output.warnings, tone: result.ok ? "success" : "error" });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("export.copyPermissionFailed");
      setWarnings([message]);
      setCopyStatus("error", message);
      setCopyDialog({ title: t("toolbar.copyFailed"), message, warnings: [message], tone: "error" });
    }
  };

  return (
    <header className="topbar">
      <div className="brand-menu-wrap" ref={menuRef}>
        <button
          type="button"
          className="brand-button"
          title="更换 Logo"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <BrandLogo />
          <span className="brand-caret" aria-hidden>
            ▾
          </span>
        </button>
        {menuOpen && (
          <div className="brand-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>
              更换 Logo…
            </button>
            {customLogo && (
              <button type="button" role="menuitem" onClick={resetLogo}>
                恢复默认
              </button>
            )}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogoFile} />
      </div>

      <span className="topbar-divider" aria-hidden />
      <span className="topbar-view">{VIEW_LABELS[view]}</span>
      <span className="topbar-doc" title={docTitle}>
        {docTitle}
      </span>
      <span className="topbar-count">· {documents.length} 篇</span>

      <span className="topbar-spacer" />

      <div className="topbar-actions">
        {view === "editor" && (
          <button
            type="button"
            className="topbar-btn"
            aria-pressed={previewVisible}
            onClick={onTogglePreview}
            title="显示或隐藏预览"
          >
            预览
          </button>
        )}
        <button
          type="button"
          className="topbar-btn"
          title={t("toolbar.exportLongImage")}
          disabled={exportStatus === "exporting" || !markdownValue.trim()}
          onClick={() => void handleExportLongImage()}
        >
          {exportStatus === "exporting" ? t("toolbar.exporting") : t("toolbar.exportLongImage")}
        </button>
        <button
          type="button"
          className="topbar-btn topbar-btn-primary"
          onClick={() => void handleCopyWechat()}
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
