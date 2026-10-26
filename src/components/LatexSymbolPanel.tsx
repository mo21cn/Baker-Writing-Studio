import { useEffect, useRef, useState } from "react";

interface LatexSymbolPanelProps {
  onInsert: (snippet: string) => void;
}

/**
 * A small palette, not a symbol database: the commands an author reaches for
 * while typing prose, plus the environments this page can render.
 */
const GROUPS: Array<{ label: string; items: Array<{ label: string; snippet: string }> }> = [
  {
    label: "希腊字母",
    items: [
      { label: "α", snippet: "\\alpha " },
      { label: "β", snippet: "\\beta " },
      { label: "γ", snippet: "\\gamma " },
      { label: "θ", snippet: "\\theta " },
      { label: "λ", snippet: "\\lambda " },
      { label: "μ", snippet: "\\mu " },
      { label: "π", snippet: "\\pi " },
      { label: "σ", snippet: "\\sigma " },
      { label: "φ", snippet: "\\phi " },
      { label: "ω", snippet: "\\omega " },
      { label: "Δ", snippet: "\\Delta " },
      { label: "Ω", snippet: "\\Omega " },
    ],
  },
  {
    label: "运算",
    items: [
      { label: "×", snippet: "\\times " },
      { label: "÷", snippet: "\\div " },
      { label: "±", snippet: "\\pm " },
      { label: "·", snippet: "\\cdot " },
      { label: "∑", snippet: "\\sum_{}^{} " },
      { label: "∏", snippet: "\\prod_{}^{} " },
      { label: "∫", snippet: "\\int_{}^{} " },
      { label: "√", snippet: "\\sqrt{}" },
    ],
  },
  {
    label: "关系",
    items: [
      { label: "≠", snippet: "\\neq " },
      { label: "≈", snippet: "\\approx " },
      { label: "≤", snippet: "\\leq " },
      { label: "≥", snippet: "\\geq " },
      { label: "≡", snippet: "\\equiv " },
      { label: "∝", snippet: "\\propto " },
      { label: "∈", snippet: "\\in " },
      { label: "∀", snippet: "\\forall " },
    ],
  },
  {
    label: "箭头",
    items: [
      { label: "→", snippet: "\\to " },
      { label: "←", snippet: "\\leftarrow " },
      { label: "⇒", snippet: "\\Rightarrow " },
      { label: "⇔", snippet: "\\Leftrightarrow " },
      { label: "↦", snippet: "\\mapsto " },
    ],
  },
  {
    label: "环境",
    items: [
      { label: "分式", snippet: "\\frac{}{}" },
      { label: "列表", snippet: "\\begin{itemize}\n\\item \n\\end{itemize}" },
      { label: "编号列表", snippet: "\\begin{enumerate}\n\\item \n\\end{enumerate}" },
      { label: "引用", snippet: "\\begin{quote}\n\n\\end{quote}" },
      { label: "公式", snippet: "\\begin{equation}\n\n\\end{equation}" },
      { label: "对齐", snippet: "\\begin{align}\n &= \n\\end{align}" },
    ],
  },
];

export function LatexSymbolPanel({ onInsert }: LatexSymbolPanelProps) {
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

  return (
    <div className="latex-symbol-wrap" ref={wrapRef}>
      <button
        type="button"
        className="pane-action-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="插入符号"
        onClick={() => setOpen((value) => !value)}
      >
        ∑
      </button>

      {open && (
        <div className="latex-symbol-panel" role="menu" aria-label="符号">
          {GROUPS.map((group) => (
            <section key={group.label}>
              <h4>{group.label}</h4>
              <div className="latex-symbol-grid">
                {group.items.map((item) => (
                  <button
                    key={`${group.label}-${item.label}`}
                    type="button"
                    role="menuitem"
                    title={item.snippet}
                    onClick={() => {
                      setOpen(false);
                      onInsert(item.snippet);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
