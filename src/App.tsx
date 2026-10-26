import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ActivityRail, type AppView } from "./components/ActivityRail";
import { DocumentList } from "./components/DocumentList";
import { EditorPane } from "./components/EditorPane";
import { PreviewPane } from "./components/PreviewPane";
import { StatusBar } from "./components/StatusBar";
import { ThemePanel } from "./components/ThemePanel";
import { TopBar } from "./components/TopBar";
import { WorkspaceSplit } from "./components/WorkspaceSplit";
import { resolveMarkdownAssetUrls } from "./core/assets/resolveAssets";
import { renderMarkdown } from "./core/markdown/renderMarkdown";
import { ensureMathJax, isMathJaxReady } from "./core/markdown/mathToSvg";
import { getActiveTheme } from "./core/theme/themes";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useDragWidth } from "./hooks/useDragWidth";
import { useEditorStore } from "./store/editorStore";

const SIDEBAR_COLLAPSED_KEY = "r2md-sidebar-collapsed";
const VIEW_STORAGE_KEY = "r2md-active-view";
const PREVIEW_VISIBLE_KEY = "r2md-preview-visible";
const RAIL_WIDTH = 48;
const TOOL_VIEWS = ["wechat", "table", "formula"] as const;
// Rail + resize handle + the narrowest useful editor/preview pair.
const RESERVED_BESIDE_LIST = 48 + 5 + 640;

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

function readPreviewVisible(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(PREVIEW_VISIBLE_KEY) !== "0";
}

function countWords(markdown: string): number {
  return markdown.replace(/\s+/g, "").length;
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [view, setView] = useState<AppView>(readStoredView);
  // Tool pages hold form state (URL, table grid, LaTeX), so they stay
  // mounted after first use and are hidden with CSS instead of unmounted.
  const [visited, setVisited] = useState<Set<AppView>>(() => new Set([readStoredView()]));
  const [previewVisible, setPreviewVisible] = useState(readPreviewVisible);
  const { width: listWidth, onMouseDown: onListResize } = useDragWidth({
    storageKey: "r2md-list-width",
    min: 180,
    max: 420,
    initial: 260,
    offset: RAIL_WIDTH,
  });

  // A width that was comfortable on a wide screen must not swallow a small
  // window: clamp it against the current viewport instead of trusting the
  // stored value.
  const [viewportWidth, setViewportWidth] = useState(
    () => (typeof window === "undefined" ? 1440 : window.innerWidth),
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effectiveListWidth = Math.min(
    listWidth,
    Math.max(180, viewportWidth - RESERVED_BESIDE_LIST),
  );

  const markdown = useEditorStore((state) => state.markdown);
  const activeDocId = useEditorStore((state) => state.activeDocId);
  const documents = useEditorStore((state) => state.documents);
  const themeId = useEditorStore((state) => state.themeId);
  const customThemeTokens = useEditorStore((state) => state.customThemeTokens);
  const customThemeName = useEditorStore((state) => state.customThemeName);
  const copyStatus = useEditorStore((state) => state.copyStatus);
  const statusMessage = useEditorStore((state) => state.statusMessage);
  const isThemePanelOpen = useEditorStore((state) => state.isThemePanelOpen);
  const closeThemePanel = useEditorStore((state) => state.closeThemePanel);
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
    setVisited((previous) => (previous.has(view) ? previous : new Set(previous).add(view)));
  }, [view]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PREVIEW_VISIBLE_KEY, previewVisible ? "1" : "0");
    }
  }, [previewVisible]);

  useEffect(() => {
    if (!isThemePanelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeThemePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isThemePanelOpen, closeThemePanel]);

  // MathJax is ~1.8 MB and only needed once; the preview waits for it
  // instead of blocking the entry chunk on it.
  const [mathReady, setMathReady] = useState(isMathJaxReady());

  useEffect(() => {
    if (mathReady) return;

    let cancelled = false;
    let timer: number | undefined;

    // The first dynamic import can lose a race with the dev server's
    // dependency optimisation, so a single failure must not be treated as
    // "loaded". Keep retrying for as long as the view lives: once the
    // converter exists this flips mathReady, which re-renders the preview
    // and re-mounts the editor so inline formula widgets can rasterise.
    const attempt = () => {
      if (cancelled) return;
      if (isMathJaxReady()) {
        setMathReady(true);
        return;
      }

      void ensureMathJax()
        .catch(() => undefined)
        .then(() => {
          if (cancelled) return;
          if (isMathJaxReady()) {
            setMathReady(true);
            return;
          }
          timer = window.setTimeout(attempt, 1500);
        });
    };

    attempt();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [mathReady]);

  // Never leave the reader staring at a spinner because a 1.8 MB engine is
  // slow: after a short grace period the preview renders with plain-text
  // formulas and upgrades itself when the engine lands.
  const [mathGraceOver, setMathGraceOver] = useState(false);

  useEffect(() => {
    if (mathReady || mathGraceOver) return;
    const timer = window.setTimeout(() => setMathGraceOver(true), 4000);
    return () => window.clearTimeout(timer);
  }, [mathReady, mathGraceOver]);

  const rendered = useMemo(
    () => (mathReady || mathGraceOver ? renderMarkdown({ markdown: previewMarkdown }) : null),
    [previewMarkdown, mathReady, mathGraceOver],
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

  const editorPane = (
    <EditorPane markdownValue={markdown} onMarkdownChange={setMarkdown} mathReady={mathReady} />
  );
  const previewPane = rendered ? (
    <PreviewPane rawHtml={rendered.rawHtml} theme={activeTheme} />
  ) : (
    <section className="pane preview-pane" aria-label="预览">
      <div className="pane-header">
        <span className="pane-title">预览</span>
      </div>
      <div className="pane-loading">正在加载公式引擎…</div>
    </section>
  );

  return (
    <div className="app-shell">
      <TopBar
        markdownValue={markdown}
        view={view}
        previewVisible={previewVisible}
        onTogglePreview={() => setPreviewVisible((visible) => !visible)}
      />

      <div className="workbench">
        <ActivityRail view={view} onChange={setView} />

        <DocumentList
          collapsed={sidebarCollapsed}
          width={effectiveListWidth}
          onToggleCollapse={toggleSidebar}
        />
        {!sidebarCollapsed && (
          <div
            className="list-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整文档列表宽度"
            onMouseDown={onListResize}
          />
        )}

        <main className="content">
          <div className="view-slot" style={{ display: view === "editor" ? "flex" : "none" }}>
            {previewVisible ? (
              <WorkspaceSplit left={editorPane} right={previewPane} />
            ) : (
              <div className="editor-only">{editorPane}</div>
            )}
          </div>

          {TOOL_VIEWS.map((tool) =>
            visited.has(tool) ? (
              <div
                key={tool}
                className="view-slot"
                style={{ display: view === tool ? "flex" : "none" }}
              >
                <Suspense fallback={<div className="pane-loading">加载中…</div>}>
                  {tool === "wechat" && <WechatToolPage />}
                  {tool === "table" && <TableToolPage />}
                  {tool === "formula" && <FormulaToolPage />}
                </Suspense>
              </div>
            ) : null,
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

      {isThemePanelOpen && (
        <>
          <div className="drawer-scrim" onClick={closeThemePanel} />
          <aside className="theme-drawer" role="dialog" aria-label="主题配置">
            <ThemePanel themeId={themeId} onThemeChange={setThemeId} />
          </aside>
        </>
      )}
    </div>
  );
}

export default App;
