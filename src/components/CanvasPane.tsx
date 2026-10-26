import type { ReactNode } from "react";
import { PaneHeader } from "./PaneHeader";

interface CanvasPaneProps {
  side: "left" | "right";
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Most panes want padding; output panes often supply their own. */
  padded?: boolean;
}

/**
 * One half of a tool canvas: header + scrollable body. The editor view
 * uses the same shape, so switching between writing and a tool no longer
 * changes the skeleton.
 */
export function CanvasPane({ side, title, meta, actions, children, padded = true }: CanvasPaneProps) {
  return (
    <section className={`pane canvas-pane canvas-pane-${side}`}>
      <PaneHeader title={title} meta={meta} actions={actions} />
      <div className={`pane-body${padded ? " pane-body-pad" : ""}`}>{children}</div>
    </section>
  );
}
