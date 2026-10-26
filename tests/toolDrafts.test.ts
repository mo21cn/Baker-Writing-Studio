import { describe, expect, it } from "vitest";
import { parseFormulaDraft, parseTableDraft } from "../src/core/tools/drafts";

describe("parseTableDraft", () => {
  it("keeps a well-formed grid", () => {
    expect(parseTableDraft({ rows: [["a", "b"], ["1", "2"]], headerRow: true })).toEqual({
      rows: [
        ["a", "b"],
        ["1", "2"],
      ],
      headerRow: true,
    });
  });

  it("pads short rows and drops non-string cells", () => {
    expect(parseTableDraft({ rows: [["a", "b"], ["x"]], headerRow: false })).toEqual({
      rows: [
        ["a", "b"],
        ["x", ""],
      ],
      headerRow: false,
    });
  });

  it("rejects shapes the grid cannot render", () => {
    expect(parseTableDraft(null)).toBeNull();
    expect(parseTableDraft({ rows: [] })).toBeNull();
    expect(parseTableDraft({ rows: [[]] })).toBeNull();
    expect(parseTableDraft({ rows: "nope" })).toBeNull();
  });
});

describe("parseFormulaDraft", () => {
  it("keeps latex and a known wrap mode", () => {
    expect(parseFormulaDraft({ latex: "\\frac{a}{b}", wrap: "display" })).toEqual({
      latex: "\\frac{a}{b}",
      wrap: "display",
    });
  });

  it("falls back to inline for an unknown wrap mode", () => {
    expect(parseFormulaDraft({ latex: "x", wrap: "weird" })?.wrap).toBe("inline");
  });

  it("rejects non-string latex", () => {
    expect(parseFormulaDraft({ latex: 42, wrap: "inline" })).toBeNull();
    expect(parseFormulaDraft(undefined)).toBeNull();
  });
});
