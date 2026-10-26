import { useEffect, useRef, useState } from "react";
import { readFormulaHistory, type FormulaHistoryEntry } from "../core/tools/formulaHistory";

interface LatexHistoryPanelProps {
  onPick: (entry: FormulaHistoryEntry) => void;
}

/** Dropdown of the last five formulas, mirroring the symbol palette. */
export function LatexHistoryPanel({ onPick }: LatexHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const history = readFormulaHistory();
  if (history.length === 0) return null;

  return (
    <div className="latex-history-wrap" ref={wrapRef}>
      <button
        type="button"
        className="pane-action-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="最近使用的公式"
        onClick={() => setOpen((value) => !value)}
      >
        历史
      </button>

      {open && (
        <div className="latex-history-panel" role="menu" aria-label="最近使用的公式">
          {history.map((entry) => (
            <button
              key={entry.latex}
              type="button"
              role="menuitem"
              className="latex-history-item"
              onClick={() => {
                setOpen(false);
                onPick(entry);
              }}
            >
              <span className="latex-history-label">{entry.latex}</span>
              <span className="latex-history-hint">
                {entry.wrap === "none" ? "无" : entry.wrap === "inline" ? "行内" : "块级"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
