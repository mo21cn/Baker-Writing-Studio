import type { ReactNode } from "react";

export type AppView = "editor" | "wechat" | "table" | "formula";

interface ViewTabsProps {
  current: AppView;
  onChange: (view: AppView) => void;
}

interface TabSpec {
  id: AppView;
  label: string;
  icon: ReactNode;
}

const ICON_EDITOR = (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <path
      d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm6.5.5V5h2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path d="M5 9h6M5 12h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ICON_WECHAT = (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <path
      d="M6 2.5C3.6 2.5 1.5 4.2 1.5 6.4c0 1.2.7 2.3 1.8 3l-.4 1.4 1.6-.8c.5.1 1 .2 1.5.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.5 10.6c0-1.9-1.8-3.4-4-3.4s-4 1.5-4 3.4 1.8 3.4 4 3.4c.4 0 .8 0 1.2-.1l1.4.7-.4-1.2c1-.6 1.8-1.6 1.8-2.8z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <circle cx="4.2" cy="6" r="0.6" fill="currentColor" />
    <circle cx="6.8" cy="6" r="0.6" fill="currentColor" />
    <circle cx="11.5" cy="10.4" r="0.5" fill="currentColor" />
    <circle cx="13.3" cy="10.4" r="0.5" fill="currentColor" />
  </svg>
);

const ICON_TABLE = (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <rect
      x="2"
      y="3"
      width="12"
      height="10"
      rx="1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <path d="M2 6.5h12M2 10h12M6 3v10M10 3v10" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const ICON_FORMULA = (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <path
      d="M3 4h3l4 8h3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M5.5 6.5l2 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const TABS: TabSpec[] = [
  { id: "editor", label: "编辑器", icon: ICON_EDITOR },
  { id: "wechat", label: "WeChat → MD", icon: ICON_WECHAT },
  { id: "table", label: "Table Converter", icon: ICON_TABLE },
  { id: "formula", label: "Formula → LaTeX", icon: ICON_FORMULA },
];

export function ViewTabs({ current, onChange }: ViewTabsProps) {
  return (
    <nav className="view-tabs" role="tablist" aria-label="主视图切换">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={current === tab.id}
          className={`view-tab${current === tab.id ? " is-active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="view-tab-icon">{tab.icon}</span>
          <span className="view-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
