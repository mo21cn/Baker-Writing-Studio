import { describe, expect, it } from "vitest";
import { isFenceLine, scanInlinePreviews } from "../src/core/markdown/inlinePreviews";

describe("scanInlinePreviews", () => {
  it("finds inline formulas with their source range", () => {
    const line = "动能 $E = mc^2$ 结束";
    const [found] = scanInlinePreviews(line);

    expect(found).toMatchObject({ kind: "math", latex: "E = mc^2" });
    expect(line.slice(found.from, found.to)).toBe("$E = mc^2$");
  });

  it("finds images and keeps alt plus src", () => {
    const [found] = scanInlinePreviews("![示意图](https://example.com/a.png)");

    expect(found).toEqual({
      kind: "image",
      from: 0,
      to: 33,
      alt: "示意图",
      src: "https://example.com/a.png",
    });
  });

  it("returns formulas and images ordered by position", () => {
    const found = scanInlinePreviews("a ![x](y.png) b $c$");

    expect(found.map((item) => item.kind)).toEqual(["image", "math"]);
  });

  it("ignores empty and multiline formulas", () => {
    expect(scanInlinePreviews("$ $")).toHaveLength(1);
    expect(scanInlinePreviews("$$ a $$")).toHaveLength(0);
    expect(scanInlinePreviews("$a\nb$")).toHaveLength(0);
  });

  it("does not treat escaped dollars as a pair", () => {
    expect(scanInlinePreviews("价格 \\$5 与 \\$9")).toHaveLength(0);
  });

  it("finds nothing in plain prose", () => {
    expect(scanInlinePreviews("普通段落，没有公式。")).toEqual([]);
  });
});

describe("isFenceLine", () => {
  it("recognises both fence styles", () => {
    expect(isFenceLine("```ts")).toBe(true);
    expect(isFenceLine("   ~~~")).toBe(true);
    expect(isFenceLine("正文 ``` 行内")).toBe(false);
  });
});
