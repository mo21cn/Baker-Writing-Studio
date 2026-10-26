import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { editorImageExtension } from "./editorImageExtension";
import { inlinePreviewWidgets } from "./editorInlineWidgets";
import { PaneHeader } from "./PaneHeader";
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

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      inlinePreviewWidgets,
      editorImageExtension({
        docId: activeDocId,
        markdown: markdownValue,
        assetFiles,
        onImageInserted: registerAssetFile,
        onMarkdownChange: onMarkdownChange,
        onError: (message) => setCopyStatus("error", message),
      }),
    ],
    [activeDocId, markdownValue, assetFiles, onMarkdownChange, registerAssetFile, setCopyStatus],
  );

  const toggleLineNumbers = () => {
    setLineNumbers((current) => {
      const next = !current;
      window.localStorage.setItem(LINE_NUMBERS_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <section className="pane editor-pane" aria-label={t("common.markdown")}>
      <PaneHeader
        title={t("common.markdown")}
        actions={
          <button
            type="button"
            className="pane-action-btn"
            aria-pressed={lineNumbers}
            title="显示或隐藏行号"
            onClick={toggleLineNumbers}
          >
            行号
          </button>
        }
      />
      <div className="pane-body">
        <CodeMirror
          key={`${activeDocId ?? "no-doc"}-${mathReady ? "math" : "plain"}`}
          value={markdownValue}
          height="100%"
          extensions={extensions}
          basicSetup={{
            lineNumbers,
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: lineNumbers,
          }}
          onChange={onMarkdownChange}
          className="markdown-editor"
        />
      </div>
    </section>
  );
}
