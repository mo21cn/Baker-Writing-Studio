import { describe, expect, it } from "vitest";
import { matchSlashCommand, SLASH_COMMANDS } from "../src/core/editor/slashCommands";
import { toggleLinePrefix, wrapAsLink } from "../src/core/editor/linePrefix";

describe("matchSlashCommand", () => {
  it("matches a label prefix", () => {
    expect(matchSlashCommand("表")?.kind).toBe("table");
    expect(matchSlashCommand("公式")?.kind).toBe("formula");
  });

  it("matches latin aliases", () => {
    expect(matchSlashCommand("ta")?.kind).toBe("table");
    expect(matchSlashCommand("hr")?.kind).toBe("divider");
  });

  it("ignores unknown or empty queries", () => {
    expect(matchSlashCommand("")).toBeUndefined();
    expect(matchSlashCommand("zzz")).toBeUndefined();
  });

  it("covers every insert kind once", () => {
    const kinds = SLASH_COMMANDS.map((command) => command.kind).sort();
    expect(kinds).toEqual(["divider", "formula", "image", "link", "table"]);
  });
});

describe("toggleLinePrefix", () => {
  it("adds the prefix to non-empty lines", () => {
    expect(toggleLinePrefix(["标题", "", "正文"], "## ")).toEqual(["## 标题", "", "## 正文"]);
  });

  it("removes it when every line already has it", () => {
    expect(toggleLinePrefix(["## a", "## b"], "## ")).toEqual(["a", "b"]);
  });

  it("adds when only some lines have it", () => {
    expect(toggleLinePrefix(["## a", "b"], "## ")).toEqual(["## ## a", "## b"]);
  });

  it("leaves blank-only selections untouched", () => {
    expect(toggleLinePrefix(["", "  "], "> ")).toEqual(["", "  "]);
  });
});

describe("wrapAsLink", () => {
  it("keeps the selected words as the label and selects the URL", () => {
    const result = wrapAsLink("官网");
    expect(result.text).toBe("[官网](https://)");
    expect(result.text.slice(result.urlStart, result.urlEnd)).toBe("https://");
  });

  it("falls back to a placeholder for empty selections", () => {
    expect(wrapAsLink("  ").text).toBe("[文字](https://)");
  });
});
