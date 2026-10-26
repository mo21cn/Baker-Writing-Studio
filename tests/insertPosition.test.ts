import { describe, expect, it } from "vitest";
import { computeInsertRange } from "../src/core/editor/insertPosition";

describe("computeInsertRange", () => {
  it("inserts at the remembered caret, not at the end", () => {
    const result = computeInsertRange("第一段\n\n第二段", 3, "$$a$$");

    expect(result.markdown).toBe("第一段\n\n$$a$$\n\n第二段");
    expect(result.caret).toBe("第一段\n\n$$a$$".length);
  });

  it("appends when no caret is known", () => {
    const result = computeInsertRange("正文", null, "$$a$$");

    expect(result.markdown).toBe("正文\n\n$$a$$");
    expect(result.caret).toBe("正文\n\n$$a$$".length);
  });

  it("does not add blank lines when the neighbours already have them", () => {
    const result = computeInsertRange("上文\n\n\n下文", 4, "$a$");

    expect(result.markdown).toBe("上文\n\n$a$\n下文");
  });

  it("clamps an out-of-range caret instead of corrupting the document", () => {
    const result = computeInsertRange("短文", 999, "$$a$$");

    expect(result.markdown).toBe("短文\n\n$$a$$");
  });

  it("handles an empty document", () => {
    const result = computeInsertRange("", null, "$$a$$");

    expect(result.markdown).toBe("$$a$$");
    expect(result.caret).toBe(5);
  });
});
