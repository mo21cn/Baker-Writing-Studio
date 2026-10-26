/**
 * Line-prefix toggles used by the floating selection row.
 *
 * Pure: the row hands in the selected lines and applies the result, so the
 * add/remove rules can be tested without an editor.
 */

export type LinePrefix = { kind: "h2" | "quote"; prefix: string };

export const LINE_PREFIXES: Record<"h2" | "quote", LinePrefix> = {
  h2: { kind: "h2", prefix: "## " },
  quote: { kind: "quote", prefix: "> " },
};

/**
 * Adds `prefix` to every non-empty line, or removes it when the whole
 * selection already carries it. Blank lines are left alone so a selection
 * spanning paragraphs does not grow stray `>` markers.
 */
export function toggleLinePrefix(lines: string[], prefix: string): string[] {
  const meaningful = lines.filter((line) => line.trim().length > 0);
  if (meaningful.length === 0) return lines;

  const alreadyPrefixed = meaningful.every((line) => line.startsWith(prefix));

  return lines.map((line) => {
    if (line.trim().length === 0) return line;
    if (alreadyPrefixed) return line.slice(prefix.length);
    return `${prefix}${line}`;
  });
}

/** Wraps selected text as a Markdown link, returning the new full text. */
export function wrapAsLink(text: string, url = "https://"): { text: string; urlStart: number; urlEnd: number } {
  const label = text.trim() || "文字";
  const wrapped = `[${label}](${url})`;
  const urlStart = label.length + 3;
  return { text: wrapped, urlStart, urlEnd: urlStart + url.length };
}
