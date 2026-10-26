import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface WorkspaceSplitProps {
  left: ReactNode;
  right: ReactNode;
  /** Persisted per surface so each tool keeps its own split. */
  storageKey?: string;
}

const DEFAULT_STORAGE_KEY = "r2md-editor-ratio";
const MIN_RATIO = 0.28;
const MAX_RATIO = 0.72;

function readStoredRatio(storageKey: string): number {
  if (typeof window === "undefined") {
    return 0.5;
  }

  const stored = window.localStorage.getItem(storageKey);
  const value = stored ? Number(stored) : 0.5;
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

export function WorkspaceSplit({ left, right, storageKey = DEFAULT_STORAGE_KEY }: WorkspaceSplitProps) {
  const [ratio, setRatio] = useState(() => readStoredRatio(storageKey));
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const ratioRef = useRef(ratio);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!draggingRef.current || !containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const nextRatio = (event.clientX - rect.left) / rect.width;
    const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, nextRatio));
    setRatio(clamped);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    document.body.classList.remove("is-resizing");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(ratioRef.current));
    }
  }, [storageKey]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleMouseDown = () => {
    draggingRef.current = true;
    document.body.classList.add("is-resizing");
  };

  return (
    <div className="workspace-split" ref={containerRef}>
      <div className="workspace-split-left" style={{ flexBasis: `${ratio * 100}%` }}>
        {left}
      </div>
      <div
        className="workspace-split-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="调节两栏宽度"
        onMouseDown={handleMouseDown}
      />
      <div className="workspace-split-right">{right}</div>
    </div>
  );
}
