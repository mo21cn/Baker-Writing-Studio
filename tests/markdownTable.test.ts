import { describe, expect, it } from "vitest";
import { looksLikeMarkdownTable, parseMarkdownTable } from "../src/core/table/markdownTable";

describe("parseMarkdownTable", () => {
  it("reads a GFM pipe table and drops the separator row", () => {
    const model = parseMarkdownTable("| 名称 | 数量 |\n| :--- | ---: |\n| 苹果 | 3 |");

    expect(model).not.toBeNull();
    expect(model!.cells).toEqual([
      ["名称", "数量"],
      ["苹果", "3"],
    ]);
    expect(model!.headerRow).toBe(true);
  });

  it("supports tables without outer pipes", () => {
    const model = parseMarkdownTable("a | b\n--- | ---\n1 | 2");

    expect(model!.cells).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("pads short rows to the header width", () => {
    const model = parseMarkdownTable("| a | b | c |\n| --- | --- | --- |\n| 1 |");

    expect(model!.cells[1]).toEqual(["1", "", ""]);
  });

  it("returns null for non-tables", () => {
    expect(parseMarkdownTable("普通段落")).toBeNull();
    expect(parseMarkdownTable("| 只有表头 |")).toBeNull();
    expect(parseMarkdownTable("")).toBeNull();
  });
});

describe("looksLikeMarkdownTable", () => {
  it("accepts a full pipe table", () => {
    expect(looksLikeMarkdownTable("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(true);
  });

  it("rejects prose and lone rows", () => {
    expect(looksLikeMarkdownTable("普通文字")).toBe(false);
    expect(looksLikeMarkdownTable("| a | b |")).toBe(false);
  });
});
