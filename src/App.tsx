import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { DocumentList } from "./components/DocumentList";
import { EditorPane } from "./components/EditorPane";
import { PreviewPane } from "./components/PreviewPane";
import { Toolbar } from "./components/Toolbar";
import { ViewTabs, type AppView } from "./components/ViewTabs";
import { WorkspaceSplit } from "./components/WorkspaceSplit";
import { resolveMarkdownAssetUrls } from "./core/assets/resolveAssets";
import { renderMarkdown } from "./core/markdown/renderMarkdown";
import { getActiveTheme } from "./core/theme/themes";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useEditorStore } from "./store/editorStore";

// Each tool page is its own tab; splitting them keeps `docx` and the
// WeChat parser out of the first paint.
const WechatToolPage = lazy(() =>
  import("./components/WechatToolPage").then((module) => ({ default: module.WechatToolPage })),
);
const TableToolPage = lazy(() =>
  import("./components/TableToolPage").then((module) => ({ default: module.TableToolPage })),
);
const FormulaToolPage = lazy(() =>
  import("./components/FormulaToolPage").then((module) => ({ default: module.FormulaToolPage })),
);

const SIDEBAR_COLLAPSED_KEY = "r2md-sidebar-collapsed";
const VIEW_STORAGE_KEY = "r2md-active-view";

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

function readStoredView(): AppView {
  if (typeof window === "undefined") {
    return "editor";
  }
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (stored === "editor" || stored === "wechat" || stored === "table" || stored === "formula") {
    return stored;
  }
  return "editor";
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [view, setView] = useState<AppView>(readStoredView);

  const markdown = useEditorStore((state) => state.markdown);
  const activeDocId = useEditorStore((state) => state.activeDocId);
  const themeId = useEditorStore((state) => state.themeId);
  const customThemeTokens = useEditorStore((state) => state.customThemeTokens);
  const customThemeName = useEditorStore((state) => state.customThemeName);
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
        if (!cancelled) {
          setPreviewMarkdown(resolved);
        }
      } catch {
        if (!cancelled) {
          setPreviewMarkdown(debouncedMarkdown);
        }
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

  const rendered = useMemo(
    () => renderMarkdown({ markdown: previewMarkdown }),
    [previewMarkdown],
  );
  const activeTheme = getActiveTheme(themeId, customThemeTokens, customThemeName);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const showDocumentList = view === "editor";

  return (
    <div className="app-shell">
      <Toolbar markdownValue={markdown} />
      <ViewTabs current={view} onChange={setView} />
      <main className="workspace">
        {showDocumentList && (
          <DocumentList collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
        )}
        {view === "editor" && (
          <WorkspaceSplit
            left={<EditorPane markdownValue={markdown} onMarkdownChange={setMarkdown} />}
            right={
              <PreviewPane
                rawHtml={rendered.rawHtml}
                theme={activeTheme}
                themeId={themeId}
                onThemeChange={setThemeId}
              />
            }
          />
        )}
        {view !== "editor" && (
          <Suspense fallback={<div className="pane">加载中…</div>}>
            {view === "wechat" && <WechatToolPage />}
            {view === "table" && <TableToolPage />}
            {view === "formula" && <FormulaToolPage />}
          </Suspense>
        )}
      </main>
    </div>
  );
}

export default App;