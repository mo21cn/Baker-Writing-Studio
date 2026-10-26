import type { EditorView } from "@codemirror/view";
import { WRAP_LABELS, toggleWrap, type BubblePosition, type WrapKind } from "./editorSelectionTools";

interface SelectionBubbleProps {
  position: BubblePosition | null;
  view: EditorView | null;
  onAfterChange: () => void;
}

const KINDS: WrapKind[] = ["bold", "italic", "code"];

export function SelectionBubble({ position, view, onAfterChange }: SelectionBubbleProps) {
  if (!position || !view) return null;

  return (
    <div
      className="selection-tools"
      role="toolbar"
      aria-label="选区格式"
      style={{ top: position.top, left: position.left }}
    >
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="selection-tools-btn"
          title={WRAP_LABELS[kind].title}
          // Keep the selection while clicking.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            toggleWrap(view, kind);
            onAfterChange();
            view.focus();
          }}
        >
          {WRAP_LABELS[kind].label}
        </button>
      ))}
    </div>
  );
}
