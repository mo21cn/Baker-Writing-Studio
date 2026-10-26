/**
 * Where a tool's block lands in the Markdown document.
 *
 * The main editor records its caret here on every selection change, so a
 * tool page can insert at the position the author last looked at instead of
 * always appending. Module-level on purpose: this changes many times a
 * second and nothing should re-render for it.
 */

let lastCaret: number | null = null;

export function setEditorCaret(position: number): void {
  lastCaret = position;
}

export function takeEditorCaret(): number | null {
  const value = lastCaret;
  lastCaret = null;
  return value;
}

export interface InsertRange {
  markdown: string;
  /** Where the caret should land: the end of the inserted block. */
  caret: number;
}

/**
 * Places `block` at `caret` (or at the end when unknown), keeping it a
 * standalone block: blank lines are added on either side unless the
 * neighbouring text already has them.
 */
export function computeInsertRange(markdown: string, caret: number | null, block: string): InsertRange {
  const at = Math.min(Math.max(0, caret ?? markdown.length), markdown.length);
  const before = markdown.slice(0, at);
  const after = markdown.slice(at);

  const needsPrefix = before.length > 0 && !before.endsWith("\n");
  const needsSuffix = after.length > 0 && !after.startsWith("\n");

  const head = before + (needsPrefix ? "\n\n" : "");
  const tail = (needsSuffix ? "\n\n" : "") + after;

  return { markdown: head + block + tail, caret: head.length + block.length };
}
