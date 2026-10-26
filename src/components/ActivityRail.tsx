import type { ReactNode } from "react";

export type AppView = "editor" | "wechat" | "table" | "latex";

interface ActivityRailProps {
  view: AppView;
  onChange: (view: AppView) => void;
}

interface RailItem {
  id: AppView;
  label: string;
  icon: ReactNode;
}

const ICONS: Record<AppView, ReactNode> = {
  editor: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 4h11l5 5v11H4z" />
      <path d="M15 4v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
  wechat: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 11a6 6 0 1 1 3 5.2L4 18l.8-3.4A5.9 5.9 0 0 1 4 11z" />
      <path d="M11 9h6" />
      <path d="M11 13h4" />
    </svg>
  ),
  table: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16M10 10v9" />
    </svg>
  ),
  latex: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M17 5H8l6 7-6 7h9" />
    </svg>
  ),
};

const ITEMS: RailItem[] = [
  { id: "latex", label: "LaTeX", icon: ICONS.latex },
  { id: "editor", label: "编辑器", icon: ICONS.editor },
  { id: "wechat", label: "公众号 → MD", icon: ICONS.wechat },
  { id: "table", label: "表格转换", icon: ICONS.table },
];

/**
 * Primary navigation. Vertical on purpose: the window is wide but not
 * tall, so a 41px horizontal tab row cost more than a 48px rail.
 *
 * The four entries are separate tools, not views of one workspace, which
 * is why this mirrors VS Code's Activity Bar rather than Obsidian's
 * ribbon (that one switches panes inside a single vault).
 */
export function ActivityRail({ view, onChange }: ActivityRailProps) {
  return (
    <nav className="activity-rail" aria-label="工具">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`activity-rail-btn${view === item.id ? " active" : ""}`}
          aria-label={item.label}
          aria-current={view === item.id ? "page" : undefined}
          title={item.label}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}
