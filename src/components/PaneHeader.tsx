import type { ReactNode } from "react";

interface PaneHeaderProps {
  title: ReactNode;
  /** Secondary, non-interactive context (counts, theme name, …). */
  meta?: ReactNode;
  /** Controls, laid out right-aligned. */
  actions?: ReactNode;
}

/**
 * The single header shape every pane uses. Before this existed the
 * editor header was plain text while the preview header carried five
 * controls, so the two columns never lined up.
 */
export function PaneHeader({ title, meta, actions }: PaneHeaderProps) {
  return (
    <div className="pane-header">
      <span className="pane-title">{title}</span>
      {meta ? <span className="pane-meta">{meta}</span> : null}
      <div className="pane-header-spacer" />
      {actions ? <div className="pane-header-actions">{actions}</div> : null}
    </div>
  );
}
