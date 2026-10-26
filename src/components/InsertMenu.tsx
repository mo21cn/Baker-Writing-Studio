import { useEffect, useRef, useState } from "react";
import type { InsertKind } from "../core/editor/insertSnippets";

interface InsertMenuProps {
  onInsert: (kind: InsertKind) => void;
}

const ITEMS: Array<{ kind: InsertKind; label: string; hint: string }> = [
  { kind: "image", label: "图片", hint: "从本地选择，插入 ![](asset://…)" },
  { kind: "table", label: "表格", hint: "插入 3 列骨架" },
  { kind: "formula", label: "公式", hint: "插入 $$ 块级公式" },
  { kind: "link", label: "链接", hint: "插入 [文字](url)" },
  { kind: "divider", label: "分隔线", hint: "插入 ---" },
];

/**
 * Lives in the 36px pane header, so the insert affordance costs no vertical
 * space.
 *
 * The panel is a single row rather than a vertical list: measured at
 * 960×600 a five-row dropdown is 165px tall and covers five code lines —
 * 38% of the visible text in the smallest supported window. One row covers
 * one line and still fits the 324px column.
 */
export function InsertMenu({ onInsert }: InsertMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="insert-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="pane-action-btn insert-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="插入"
        onClick={() => setOpen((value) => !value)}
      >
        + 插入
      </button>

      {open && (
        <div className="insert-menu" role="menu" aria-label="插入">
          {ITEMS.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              className="insert-menu-item"
              title={item.hint}
              onClick={() => {
                setOpen(false);
                onInsert(item.kind);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
