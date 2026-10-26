/**
 * Slash commands: the keyboard path to the same inserts the header menu
 * offers, for authors who never leave the text.
 *
 * Pure matching logic, so the menu labels and the typed query stay in sync
 * and can be asserted without a DOM.
 */

import type { InsertKind } from "./insertSnippets";

export interface SlashCommand {
  kind: InsertKind;
  /** What the menu shows and what the author types after the slash. */
  label: string;
  /** Latin aliases, so /table works as well as /表格. */
  aliases: string[];
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { kind: "table", label: "表格", aliases: ["table", "biao"], description: "3 列骨架" },
  { kind: "formula", label: "公式", aliases: ["formula", "gongshi"], description: "$$ 块级公式" },
  { kind: "link", label: "链接", aliases: ["link", "lianjie"], description: "[文字](url)" },
  { kind: "image", label: "图片", aliases: ["image", "tupian"], description: "选择本地图片" },
  { kind: "divider", label: "分隔线", aliases: ["divider", "hr"], description: "---" },
];

/** `query` is what the author typed after the slash, without the slash. */
export function matchSlashCommand(query: string): SlashCommand | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;

  return SLASH_COMMANDS.find(
    (command) =>
      command.label.startsWith(normalized) ||
      command.aliases.some((alias) => alias.startsWith(normalized)),
  );
}
