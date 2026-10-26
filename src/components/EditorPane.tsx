import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { EditorView as EditorViewType } from "@codemirror/view";
import {
  editorImageExtension,
  insertImageFiles,
  type ImageExtensionOptions,
} from "./editorImageExtension";
import { blockPreviewWidgets } from "./editorBlockWidgets";
import { inlinePreviewWidgets } from "./editorInlineWidgets";
import { InsertMenu } from "./InsertMenu";
import { PaneHeader } from "./PaneHeader";
import { SelectionBubble } from "./SelectionBubble";
import { bubblePosition, type BubblePosition } from "./editorSelectionTools";
import { applyInsert } from "../core/editor/applyInsert";
import type { InsertKind } from "../core/editor/insertSnippets";
import { useEditorStore } from "../store/editorStore";

const EMPTY_ASSET_FILES: string[] = [];
const LINE_NUMBERS_KEY = "r2md-editor-line-numbers";

function readLineNumbers(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(LINE_NUMBERS_KEY) !== "0";
}

interface EditorPaneProps {
  markdownValue: string;
  onMarkdownChange: (markdownValue: string) => void;
  /** Re-mount once MathJax is ready so formula widgets can render. */
  mathReady?: boolean;
}

export function EditorPane({ markdownValue, onMarkdownChange, mathReady = true }: EditorPaneProps) {
  const { t } = useTranslation();
  const activeDocId = useEditorStore((state) => state.activeDocId);
  const assetFiles = useEditorStore((state) => {
    const doc = state.documents.find((entry) => entry.id === state.activeDocId);
    return doc?.assetFiles ?? EMPTY_ASSET_FILES;
  });
  const registerAssetFile = useEditorStore((state) => state.registerAssetFile);
  const setCopyStatus = useEditorStore((state) => state.setCopyStatus);
  const [lineNumbers, setLineNumbers] = useState(readLineNumbers);
  const [bubble, setBubble] = useState<BubblePosition | null>(null);
  const [viewVersion, setViewVersion] = useState(0);

  const viewRef = useRef<EditorViewType | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The extension closes over these callbacks for its whole lifetime.
  // Rebuilding it on every keystroke made CodeMirror reconfigure the whole
  // state (27 KB document: 8–31 ms per keystroke), so the current values are
  // read through a ref instead.
  const imageOptionsRef = useRef<ImageExtensionOptions>({
    docId: activeDocId,
    markdown: markdownValue,
    assetFiles,
    onImageInserted: registerAssetFile,
    onMarkdownChange,
    onError: () => undefined,
  });
  imageOptionsRef.current = {
    docId: activeDocId,
    markdown: markdownValue,
    assetFiles,
    onImageInserted: registerAssetFile,
    onMarkdownChange,
    onError: (message) => setCopyStatus("error", message),
  };

  const imageOptions = useMemo<ImageExtensionOptions>(
    () => ({
      get docId() {
        return imageOptionsRef.current.docId;
      },
      get markdown() {
        return imageOptionsRef.current.markdown;
      },
      get assetFiles() {
        return imageOptionsRef.current.assetFiles;
      },
      onImageInserted: (filename) => imageOptionsRef.current.onImageInserted(filename),
      onMarkdownChange: (value) => imageOptionsRef.current.onMarkdownChange(value),
      onError: (message) => imageOptionsRef.current.onError(message),
    }),
    [],
  );

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      inlinePreviewWidgets,
      blockPreviewWidgets,
      // Keeps the floating row glued to the current selection.
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.focusChanged) return;
        const next = bubblePosition(update.view);
        setBubble((previous) => {
          if (!next && !previous) return previous;
          if (next && previous && next.top === previous.top && next.left === previous.left) {
            return previous;
          }
          return next;
        });
      }),
      EditorView.domEventHandlers({
        blur: () => setBubble(null),
        scroll: () => setBubble(null),
      }),
      editorImageExtension(imageOptions),
    ],
    [imageOptions],
  );

  const basicSetup = useMemo(
    () => ({
      lineNumbers,
      foldGutter: false,
      highlightActiveLine: true,
      highlightActiveLineGutter: lineNumbers,
    }),
    [lineNumbers],
  );

  const toggleLineNumbers = () => {
    setLineNumbers((current) => {
      const next = !current;
      window.localStorage.setItem(LINE_NUMBERS_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleInsert = (kind: InsertKind) => {
    const view = viewRef.current;
    if (!view) return;

    if (kind === "image") {
      fileInputRef.current?.click();
      return;
    }

    applyInsert(view, kind);
    onMarkdownChange(view.state.doc.toString());
    setBubble(bubblePosition(view));
    view.focus();
  };

  const handlePickImages = async (files: FileList | null) => {
    const view = viewRef.current;
    if (!view || !files || files.length === 0) return;

    try {
      await insertImageFiles(view, Array.from(files), imageOptions);
      onMarkdownChange(view.state.doc.toString());
      view.focus();
    } catch (error) {
      setCopyStatus("error", error instanceof Error ? error.message : "图片插入失败");
    }
  };

  return (
    <section className="pane editor-pane" aria-label={t("common.markdown")}>
      <PaneHeader
        title={t("common.markdown")}
        actions={
          <>
            <InsertMenu onInsert={handleInsert} />
            <button
              type="button"
              className="pane-action-btn"
              aria-pressed={lineNumbers}
              title="显示或隐藏行号"
              onClick={toggleLineNumbers}
            >
              行号
            </button>
          </>
        }
      />
      <div className="pane-body">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            void handlePickImages(event.target.files);
            event.target.value = "";
          }}
        />
        <CodeMirror
          // Remount only when a formula document gains the engine: the
          // widgets resolve their SVG at construction time. Documents
          // without formulas keep their editor (and cursor) untouched.
          key={`${activeDocId ?? "no-doc"}-${mathReady || !markdownValue.includes("$") ? "math" : "plain"}`}
          value={markdownValue}
          height="100%"
          extensions={extensions}
          onCreateEditor={(view) => {
            viewRef.current = view;
            setViewVersion((value) => value + 1);
            // Dev-only handle so the editor can be driven from the console
            // and from browser probes. Stripped from production builds.
            if (import.meta.env.DEV) {
              (window as unknown as { __r2mdView?: EditorViewType }).__r2mdView = view;
            }
          }}
          basicSetup={basicSetup}
          onChange={onMarkdownChange}
          className="markdown-editor"
        />
      </div>

      <SelectionBubble
        position={bubble}
        view={viewVersion > 0 ? viewRef.current : null}
        onAfterChange={() => {
          const view = viewRef.current;
          if (view) onMarkdownChange(view.state.doc.toString());
        }}
      />
    </section>
  );
}
