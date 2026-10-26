import { describe, expect, it } from "vitest";
import { parseLatex } from "../src/core/latex/parseLatex";
import { blocksToDocxParagraphs } from "../src/core/latex/docx";

const count = async (source: string, options = {}) => {
  const paragraphs = await blocksToDocxParagraphs(parseLatex(source).blocks, options);
  return paragraphs.length;
};

describe("blocksToDocxParagraphs", () => {
  it("emits one paragraph per heading, paragraph, list item and formula", async () => {
    const source = [
      "\\section{标题}",
      "正文一段。",
      "\\begin{itemize}",
      "\\item 甲",
      "\\item 乙",
      "\\end{itemize}",
      "\\begin{equation}",
      "a = b",
      "\\end{equation}",
    ].join("\n");

    // heading + paragraph + two items + one formula
    expect(await count(source)).toBe(5);
  });

  it("keeps formulas that docx can express and skips the ones it cannot", async () => {
    expect(await count("$a^2 + b^2$")).toBe(1);

    // An expression latexToMath rejects must not abort the export.
    const broken = "\\begin{equation}\n\\notarealcommand{x}\n\\end{equation}";
    const withFallback = await count(broken, {
      mathFallback: async () => null,
    });
    expect(withFallback).toBe(0);
  });

  it("renders code blocks as a single paragraph", async () => {
    expect(await count("\\begin{verbatim}\nlet a = 1\nlet b = 2\n\\end{verbatim}")).toBe(1);
  });

  it("marks unsupported commands instead of dropping them", async () => {
    expect(await count("\\begin{figure}\n\\end{figure}")).toBe(1);
  });
});
