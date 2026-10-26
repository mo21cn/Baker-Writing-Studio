import { describe, expect, it } from "vitest";
import { parseLatex } from "../src/core/latex/parseLatex";
import { blocksToDocxParagraphs } from "../src/core/latex/docx";
import { LATEX_SAMPLE } from "../src/core/latex/samples";

/**
 * End-to-end guard for the document mode: the sample the 「插入示例文档」
 * button offers must survive parsing and produce the expected Word outline.
 * If a parser change ever collapses sections or list items, this fails.
 */
describe("LaTeX sample → Word", () => {
  it("parses the shipped sample without diagnostics", () => {
    const { blocks, diagnostics } = parseLatex(LATEX_SAMPLE);

    expect(diagnostics).toEqual([]);
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list"]);
  });

  it("exports one Word paragraph per heading, paragraph and list item", async () => {
    const { blocks } = parseLatex(LATEX_SAMPLE);
    const paragraphs = await blocksToDocxParagraphs(blocks);

    // 1 heading + 1 paragraph + 2 list items
    expect(paragraphs).toHaveLength(4);
  });
});
