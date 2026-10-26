interface StatusBarProps {
  docTitle: string;
  wordCount: number;
  statusMessage: string;
  statusTone: "idle" | "copying" | "success" | "error";
  themeName: string;
}

/**
 * Transient state belongs at the bottom, not in the top bar: the top bar
 * carries "where am I / what am I editing", the status bar carries
 * "what just happened".
 */
export function StatusBar({ docTitle, wordCount, statusMessage, statusTone, themeName }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="statusbar-strong">{docTitle || "未命名文档"}</span>
      <span>{wordCount.toLocaleString("zh-CN")} 字</span>
      <span className="statusbar-spacer" />
      <span className={`statusbar-status status-${statusTone}`} role="status">
        {statusMessage}
      </span>
      <span className="statusbar-spacer" />
      <span>主题 {themeName}</span>
    </footer>
  );
}
