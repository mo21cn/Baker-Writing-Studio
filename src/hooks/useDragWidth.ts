import { useCallback, useEffect, useRef, useState } from "react";

interface DragWidthOptions {
  storageKey: string;
  min: number;
  max: number;
  initial: number;
  /** Pixels to the left of the panel (the activity rail). */
  offset?: number;
}

/**
 * A left-column width the user can drag, persisted across restarts.
 *
 * Extracted from the pattern WorkspaceSplit already used so the document
 * list and any future panel share one implementation.
 */
export function useDragWidth({ storageKey, min, max, initial, offset = 0 }: DragWidthOptions) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return initial;
    const stored = Number(window.localStorage.getItem(storageKey));
    if (!Number.isFinite(stored) || stored <= 0) return initial;
    return Math.min(max, Math.max(min, stored));
  });

  const draggingRef = useRef(false);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const onMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    draggingRef.current = true;
    document.body.classList.add("is-resizing");
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(max, Math.max(min, event.clientX - offset));
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("is-resizing");
      try {
        window.localStorage.setItem(storageKey, String(widthRef.current));
      } catch {
        // Persisting the width is a nicety; ignore quota failures.
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [min, max, offset, storageKey]);

  return { width, onMouseDown };
}
