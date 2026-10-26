import { describe, expect, it } from "vitest";
import { findBlockPreviews } from "../src/core/markdown/blockPreviews";

const lines = (text: string | string[]) => (Array.isArray(text) ? text : text.split("\n"));

describe("findBlockPreviews — tables", () => {
  it("parses a table into header plus body with alignments", () => {
    const doc = lines(["| 名称 | 值 |", "| :--- | ---: |", "| a | 1 |", "| b | 2 |"].join("\n"));
    const [table] = findBlockPreviews(doc);

    expect(table).toMatchObject({ kind: "table", startLine: 0, endLine: 3 });
    if (table.kind !== "table") throw new Error("expected table");
    expect(table.rows).toEqual([
      ["名称", "值"],
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(table.alignments).toEqual(["left", "right"]);
  });

  it("ignores a pipe line without a separator row", () => {
    expect(findBlockPreviews(lines(["| a | b |", "普通段落"])).filter((b) => b.kind === "table")).toEqual([]);
  });

  it("stops at the first non-row line", () => {
    const doc = lines(["| a |", "| --- |", "| 1 |", "", "后续"]);
    const [table] = findBlockPreviews(doc);

    expect(table).toMatchObject({ kind: "table", endLine: 2 });
  });

  it("accepts tables without outer pipes", () => {
    const [table] = findBlockPreviews(lines(["a | b", ":-- | --:", "1 | 2"]));

    expect(table.kind).toBe("table");
    if (table.kind !== "table") throw new Error("expected table");
    expect(table.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(table.alignments).toEqual(["left", "right"]);
  });
});

describe("findBlockPreviews — fenced code", () => {
  it("captures language and body", () => {
    const [block] = findBlockPreviews(lines(["```ts", "const a = 1;", "```"]));

    expect(block).toMatchObject({ kind: "code", language: "ts", code: "const a = 1;" });
  });

  it("ignores an unterminated fence", () => {
    expect(findBlockPreviews(lines(["```ts", "const a = 1;"]))).toEqual([]);
  });

  it("supports tilde fences and longer markers", () => {
    const [block] = findBlockPreviews(lines(["~~~python", "print(1)", "~~~"]));

    expect(block).toMatchObject({ kind: "code", language: "python" });
  });

  it("does not confuse an inner fence marker with the closing one", () => {
    const [block] = findBlockPreviews(lines(["````md", "```", "inner", "```", "````"]));

    expect(block.kind).toBe("code");
    if (block.kind !== "code") throw new Error("expected code");
    expect(block.code).toBe("```\ninner\n```");
  });

  it("keeps code inside a fence away from table detection", () => {
    const found = findBlockPreviews(lines(["```", "| a | b |", "| --- | --- |", "```"]));

    expect(found.map((b) => b.kind)).toEqual(["code"]);
  });

  it("finds several blocks in order", () => {
    const found = findBlockPreviews(
      lines(["| a |", "| --- |", "| 1 |", "", "```js", "x", "```"]),
    );

    expect(found.map((b) => [b.kind, b.startLine])).toEqual([
      ["table", 0],
      ["code", 4],
    ]);
  });
});
