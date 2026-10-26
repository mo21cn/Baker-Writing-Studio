import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ActivityRail, type AppView } from "./components/ActivityRail";
import { DocumentList } from "./components/DocumentList";
import { EditorPane } from "./components/EditorPane";
import { PreviewPane } from "./components/PreviewPane";
import { StatusBar } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import { WorkspaceSplit } from "./components/WorkspaceSplit";
import { resolveMarkdownAssetUrls } from "./core/assets/resolveAssets";
import { renderMarkdown } from "./core/markdown/renderMarkdown";
import { ensureMathJax, isMathJaxReady } from "./core/markdown/mathToSvg";
import { getActiveTheme } from "./core/theme/themes";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useEditorStore } from "./store/editorStore";

const SIDEBAR_COLLAPSED_KEY = "r2md-sidebar-collapsed";
const VIEW_STORAGE_KEY = "r2md-active-view";

// Each tool page is its own workspace; splitting them keeps `docx` and
// the WeChat parser out of the first paint.
const WechatToolPage = lazy(() =>
  import("./components/WechatToolPage").then((module) => ({ default: module.WechatToolPage })),
);
const TableToolPage = lazy(() =>
  import("./components/TableToolPage").then((module) => ({ default: module.TableToolPage })),
);
const FormulaToolPage = lazy(() =>
  import("./components/FormulaToolPage").then((module) => ({ default: module.FormulaToolPage })),
);

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

function readStoredView(): AppView {
  if (typeof window === "undefined") return "editor";
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (stored === "editor" || stored === "wechat" || stored === "table" || stored === "formula") {
    return stored;
  }
  return "editor";
}

function countWords(markdown: string): number {
  return markdown.replace(/\s+/g, "").length;
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [view, setView] = useState<AppView>(readStoredView);

  const markdown = useEditorStore((state) => state.markdown);
  const activeDocId = useEditorStore((state) => state.activeDocId);
  const documents = useEditorStore((state) => state.documents);
  const themeId = useEditorStore((state) => state.themeId);
  const customThemeTokens = useEditorStore((state) => state.customThemeTokens);
  const customThemeName = useEditorStore((state) => state.customThemeName);
  const copyStatus = useEditorStore((state) => state.copyStatus);
  const statusMessage = useEditorStore((state) => state.statusMessage);
  const setMarkdown = useEditorStore((state) => state.setMarkdown);
  const setThemeId = useEditorStore((state) => state.setThemeId);

  // Parse at a human pace: the editor stays instant, the preview and the
  // asset resolution catch up shortly after typing stops.
  const debouncedMarkdown = useDebouncedValue(markdown, 220);
  const [previewMarkdown, setPreviewMarkdown] = useState(markdown);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveMarkdownAssetUrls(activeDocId, debouncedMarkdown);
        if (!cancelled) setPreviewMarkdown(resolved);
      } catch {
        if (!cancelled) setPreviewMarkdown(debouncedMarkdown);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDocId, debouncedMarkdown]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    }
  }, [view]);

  // MathJax is ~1.8 MB and only needed once; the preview waits for it
  // instead of blocking the entry chunk on it.
  const [mathReady, setMathReady] = useState(isMathJaxReady());

  useEffect(() => {
    let cancelled = false;
    void ensureMathJax()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setMathReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rendered = useMemo(
    () => (mathReady ? renderMarkdown({ markdown: previewMarkdown }) : null),
    [previewMarkdown, mathReady],
  );

  const activeTheme = getActiveTheme(themeId, customThemeTokens, customThemeName);
  const activeDoc = documents.find((doc) => doc.id === activeDocId);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="app-shell">
      <TopBar markdownValue={markdown} view={view} />

      <div className="workbench">
        <ActivityRail view={view} onChange={setView} />

        <DocumentList collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />

        <main className="content">
          {view === "editor" && (
            <WorkspaceSplit
              left={<EditorPane markdownValue={markdown} onMarkdownChange={setMarkdown} />}
              right={
                rendered ? (
                  <PreviewPane
                    rawHtml={rendered.rawHtml}
                    theme={activeTheme}
                    themeId={themeId}
                    onThemeChange={setThemeId}
                  />
                ) : (
                  <section className="pane preview-pane" aria-label="预览">
                    <div className="pane-header">
                      <span className="pane-title">预览</span>
                    </div>
                    <div className="pane-loading">正在加载公式引擎…</div>
                  </section>
                )
              }
            />
          )}

          {view !== "editor" && (
            <Suspense fallback={<div className="pane-loading">加载中…</div>}>
              {view === "wechat" && <WechatToolPage />}
              {view === "table" && <TableToolPage />}
              {view === "formula" && <FormulaToolPage />}
            </Suspense>
          )}
        </main>
      </div>

      <StatusBar
        docTitle={activeDoc?.title ?? ""}
        wordCount={countWords(markdown)}
        statusMessage={statusMessage}
        statusTone={copyStatus}
        themeName={activeTheme.name}
      />
    </div>
  );
}

export default App;
