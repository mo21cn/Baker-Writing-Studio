import { describe, expect, it } from "vitest";
import { parseLatex } from "../src/core/latex/parseLatex";
import { blocksToDocxParagraphs, type DocxRenderOptions } from "../src/core/latex/docx";

/**
 * End-to-end for the "diagnostics present, Word still exports" path: the
 * combination the LaTeX page actually ships — a document with one good
 * formula, one broken formula and two unsupported commands.
 */
const SOURCE = [
  "\\section{测试}",
  "支持 \\textbf{加粗} 与 \\cite{key} 引用。",
  "",
  "\\begin{equation}",
  "a^2 + b^2 = c^2",
  "\\end{equation}",
  "",
  "\\begin{figure}",
  "\\end{figure}",
].join("\n");

// latexToMath accepts a^2+b^2 but the page-level fallback is what the real
// export passes in; emulate a converter that rejects nothing here.
const options: DocxRenderOptions = { mathFallback: async () => null };

describe("diagnostics → Word export", () => {
  it("reports both unsupported commands while parsing", () => {
    const { diagnostics } = parseLatex(SOURCE);

    expect(diagnostics.map((entry) => entry.command)).toEqual(["\\cite", "\\begin{figure}"]);
    expect(diagnostics.map((entry) => entry.line)).toEqual([2, 8]);
  });

  it("exports the whole document without throwing", async () => {
    const { blocks } = parseLatex(SOURCE);

    // heading + paragraph(with \cite run) + formula + unsupported note
    const paragraphs = await blocksToDocxParagraphs(blocks, options);
    expect(paragraphs).toHaveLength(4);
  });

  it("keeps every unsupported command visible in the export", async () => {
    const { blocks } = parseLatex(SOURCE.replace("a^2 + b^2 = c^2", "\\broken{x}"));

    // the broken formula is skipped, but the unsupported commands survive
    const paragraphs = await blocksToDocxParagraphs(blocks, options);
    expect(paragraphs).toHaveLength(3);
  });
});
