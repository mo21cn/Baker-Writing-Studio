import type { EditorView } from "@codemirror/view";
import {
  ACTION_LABELS,
  runSelectionAction,
  type ActionKind,
  type BubblePosition,
} from "./editorSelectionTools";

interface SelectionBubbleProps {
  position: BubblePosition | null;
  view: EditorView | null;
  onAfterChange: () => void;
}

const KINDS: ActionKind[] = ["bold", "italic", "code", "h2", "quote", "link"];

export function SelectionBubble({ position, view, onAfterChange }: SelectionBubbleProps) {
  if (!position || !view) return null;

  return (
    <div
      className="selection-tools"
      role="toolbar"
      aria-label="选区格式"
      style={{ top: position.top, left: position.left }}
    >
      {KINDS.map((kind, index) => (
        <button
          key={kind}
          type="button"
          className={`selection-tools-btn${index === 3 ? " selection-tools-divider" : ""}`}
          title={ACTION_LABELS[kind].title}
          // Keep the selection while clicking.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            runSelectionAction(view, kind);
            onAfterChange();
            view.focus();
          }}
        >
          {ACTION_LABELS[kind].label}
        </button>
      ))}
    </div>
  );
}
