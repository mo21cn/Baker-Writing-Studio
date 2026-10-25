import { describe, expect, it } from "vitest";
import { texCacheSize, texToSvg } from "./mathToSvg";

describe("texToSvg", () => {
  it("returns the memoised SVG for a repeated formula", () => {
    const first = texToSvg("a^2 + b^2 = c^2", { displayMode: false });
    const sizeAfterFirst = texCacheSize();
    const second = texToSvg("a^2 + b^2 = c^2", { displayMode: false });
    expect(second).toBe(first);
    expect(texCacheSize()).toBe(sizeAfterFirst);
  });

  it("keeps display and inline output in separate cache entries", () => {
    const inline = texToSvg("\\frac{1}{2}", { displayMode: false });
    const display = texToSvg("\\frac{1}{2}", { displayMode: true });
    expect(inline).not.toBe(display);
    expect(inline).toContain("<svg");
  });
});
