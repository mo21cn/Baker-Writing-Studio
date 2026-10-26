import { describe, expect, it } from "vitest";
import { planInsert, TABLE_SKELETON } from "../src/core/editor/insertSnippets";

const caret = { selection: "", contentBefore: false, contentAfter: false };

describe("planInsert — table", () => {
  it("inserts a three-column skeleton with a header, separator and empty row", () => {
    const plan = planInsert("table", caret);

    expect(plan.text).toBe(TABLE_SKELETON);
    expect(plan.text.split("\n")).toEqual([
      "| 列 1 | 列 2 | 列 3 |",
      "| --- | --- | --- |",
      "|  |  |  |",
    ]);
    expect(plan.cursorOffset).toBe(TABLE_SKELETON.length);
  });

  it("adds blank lines when the cursor sits inside a paragraph", () => {
    const plan = planInsert("table", { selection: "", contentBefore: true, contentAfter: true });

    expect(plan.text.startsWith("\n\n")).toBe(true);
    expect(plan.text.endsWith("\n\n")).toBe(true);
    expect(plan.cursorOffset).toBe(2 + TABLE_SKELETON.length);
  });
});

describe("planInsert — formula", () => {
  it("puts the caret between the fences", () => {
    const plan = planInsert("formula", caret);

    expect(plan.text).toBe("$$\n\n$$");
    expect(plan.text.slice(0, plan.cursorOffset)).toBe("$$\n");
    expect(plan.text.slice(plan.cursorOffset!)).toBe("\n$$");
  });
});

describe("planInsert — link", () => {
  it("selects the placeholder label so typing replaces it", () => {
    const plan = planInsert("link", caret);

    expect(plan.text).toBe("[文字](https://)");
    expect(plan.text.slice(plan.select!.from, plan.select!.to)).toBe("文字");
  });

  it("wraps an existing selection and selects the URL instead", () => {
    const plan = planInsert("link", { ...caret, selection: "官网" });

    expect(plan.text).toBe("[官网](https://)");
    expect(plan.text.slice(plan.select!.from, plan.select!.to)).toBe("https://");
  });
});

describe("planInsert — divider and image", () => {
  it("inserts a horizontal rule", () => {
    expect(planInsert("divider", caret).text).toBe("---");
  });

  it("selects the alt text of the image placeholder", () => {
    const plan = planInsert("image", caret);

    expect(plan.text).toBe("![图片](asset://)");
    expect(plan.text.slice(plan.select!.from, plan.select!.to)).toBe("图片");
  });
});
