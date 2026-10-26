/**
 * Text produced by the editor's "+ 插入" menu.
 *
 * Pure so the exact skeletons can be asserted without a DOM, and so the
 * menu never has to know how CodeMirror applies a change.
 */

export type InsertKind = "image" | "table" | "formula" | "link" | "divider";

export interface InsertContext {
  /** Currently selected text, empty when the cursor is a caret. */
  selection: string;
  /** Is there content on the cursor's line before the caret? */
  contentBefore: boolean;
  /** Is there content on the cursor's line after the caret? */
  contentAfter: boolean;
}

export interface InsertPlan {
  text: string;
  /** Caret position, relative to the start of `text`. */
  cursorOffset?: number;
  /** Selection range, relative to the start of `text`. */
  select?: { from: number; to: number };
}

export const TABLE_SKELETON = [
  "| 列 1 | 列 2 | 列 3 |",
  "| --- | --- | --- |",
  "|  |  |  |",
].join("\n");

const LINK_PLACEHOLDER = "文字";
const LINK_URL_PLACEHOLDER = "https://";
const IMAGE_PLACEHOLDER = "图片";

/** Block-level inserts get blank lines so they never glue onto a paragraph. */
function asBlock(text: string, context: InsertContext): { text: string; shift: number } {
  const leading = context.contentBefore ? "\n\n" : "";
  const trailing = context.contentAfter ? "\n\n" : "";
  return { text: `${leading}${text}${trailing}`, shift: leading.length };
}

export function planInsert(kind: InsertKind, context: InsertContext): InsertPlan {
  switch (kind) {
    case "table": {
      const block = asBlock(TABLE_SKELETON, context);
      return { text: block.text, cursorOffset: block.shift + TABLE_SKELETON.length };
    }

    case "formula": {
      const skeleton = "$$\n\n$$";
      const block = asBlock(skeleton, context);
      // Between the opening and closing fences.
      return { text: block.text, cursorOffset: block.shift + 3 };
    }

    case "divider": {
      const block = asBlock("---", context);
      return { text: block.text, cursorOffset: block.shift + 3 };
    }

    case "image": {
      // The menu opens a file picker; this snippet is the fallback when the
      // picker is cancelled and the user still wants a placeholder.
      const snippet = `![${IMAGE_PLACEHOLDER}](asset://)`;
      const block = asBlock(snippet, context);
      return {
        text: block.text,
        select: { from: block.shift + 2, to: block.shift + 2 + IMAGE_PLACEHOLDER.length },
      };
    }

    case "link": {
      const label = context.selection.trim() || LINK_PLACEHOLDER;
      const snippet = `[${label}](${LINK_URL_PLACEHOLDER})`;
      const shift = 0;
      return context.selection.trim()
        ? // Wrapping existing text: the next thing the author needs is the URL.
          {
            text: snippet,
            select: {
              from: shift + 1 + label.length + 2,
              to: shift + 1 + label.length + 2 + LINK_URL_PLACEHOLDER.length,
            },
          }
        : // Nothing selected: the label is the placeholder to replace.
          { text: snippet, select: { from: shift + 1, to: shift + 1 + label.length } };
    }
  }
}
