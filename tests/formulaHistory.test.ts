// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { pushFormulaHistory, readFormulaHistory } from "../src/core/tools/formulaHistory";

describe("formula history", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("is empty when nothing was stored", () => {
    expect(readFormulaHistory()).toEqual([]);
  });

  it("keeps the newest first and deduplicates", () => {
    pushFormulaHistory("a^2", "inline");
    pushFormulaHistory("b + c", "display");
    pushFormulaHistory("a^2", "inline");

    const history = readFormulaHistory();
    expect(history.map((entry) => entry.latex)).toEqual(["a^2", "b + c"]);
    expect(history[0].wrap).toBe("inline");
  });

  it("ignores blank input", () => {
    pushFormulaHistory("   ", "inline");
    expect(readFormulaHistory()).toEqual([]);
  });

  it("caps at five entries", () => {
    for (let index = 0; index < 8; index += 1) {
      pushFormulaHistory(`x^${index}`, "inline");
    }
    const history = readFormulaHistory();
    expect(history).toHaveLength(5);
    expect(history[0].latex).toBe("x^7");
  });
});
