import { describe, expect, it } from "vitest";
import { parseLatex } from "../src/core/latex/parseLatex";

const kinds = (source: string) => parseLatex(source).blocks.map((block) => block.kind);
const text = (source: string) => {
  const first = parseLatex(source).blocks[0];
  if (!first || first.kind !== "paragraph") throw new Error("expected a paragraph");
  return first.children
    .map((node) => ("text" in node ? node.text.split("\u0001").join(" ") : `[${node.kind}]`))
    .join("");
};

describe("parseLatex — headings and paragraphs", () => {
  it("reads the three heading levels and keeps numbering", () => {
    const { blocks } = parseLatex("\\section{标题}\n正文\n\\subsection*{副标题}");

    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "heading"]);
    expect(blocks[0]).toMatchObject({ level: 1, numbered: true });
    expect(blocks[2]).toMatchObject({ level: 2, numbered: false });
  });

  it("joins wrapped lines into one paragraph and splits on blank lines", () => {
    expect(kinds("第一行\n第二行\n\n第二段")).toEqual(["paragraph", "paragraph"]);
    expect(text("第一行\n第二行")).toBe("第一行 第二行");
  });

  it("strips comments but keeps escaped percent signs", () => {
    expect(text("折扣 50\\% 起 % 这是注释")).toBe("折扣 50% 起");
  });
});

describe("parseLatex — inline formatting", () => {
  it("marks math separately from text", () => {
    const [paragraph] = parseLatex("质能方程 $E = mc^2$ 成立").blocks;
    if (!paragraph || paragraph.kind !== "paragraph") throw new Error("expected paragraph");

    expect(paragraph.children.map((node) => node.kind)).toEqual(["text", "math", "text"]);
    expect(paragraph.children[1]).toMatchObject({ latex: "E = mc^2", display: false });
  });

  it("nests emphasis inside strong", () => {
    const [paragraph] = parseLatex("\\textbf{加粗 \\emph{斜体}}").blocks;
    if (!paragraph || paragraph.kind !== "paragraph") throw new Error("expected paragraph");

    const strong = paragraph.children[0];
    expect(strong).toMatchObject({ kind: "strong" });
    if (strong.kind !== "strong") throw new Error("expected strong");
    expect(strong.children.some((node) => node.kind === "emph")).toBe(true);
  });

  it("renders texttt as code and keeps its content literal", () => {
    const [paragraph] = parseLatex("运行 \\texttt{npm test} 即可").blocks;
    if (!paragraph || paragraph.kind !== "paragraph") throw new Error("expected paragraph");

    expect(paragraph.children[1]).toEqual({ kind: "code", text: "npm test" });
  });
});

describe("parseLatex — lists and quotes", () => {
  it("splits items and keeps their paragraphs", () => {
    const [list] = parseLatex("\\begin{itemize}\n\\item 第一项\n\\item 第二项\n\\end{itemize}").blocks;

    expect(list.kind).toBe("list");
    if (list.kind !== "list") throw new Error("expected list");
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    expect(list.items[0][0]).toMatchObject({ kind: "paragraph" });
  });

  it("supports nested lists", () => {
    const source = [
      "\\begin{enumerate}",
      "\\item 外层",
      "\\begin{itemize}",
      "\\item 内层",
      "\\end{itemize}",
      "\\end{enumerate}",
    ].join("\n");
    const [list] = parseLatex(source).blocks;

    if (list.kind !== "list") throw new Error("expected list");
    expect(list.ordered).toBe(true);
    expect(list.items[0].some((block) => block.kind === "list")).toBe(true);
  });

  it("wraps quote bodies as blocks", () => {
    const [quote] = parseLatex("\\begin{quote}\n引用的一段话\n\\end{quote}").blocks;

    expect(quote.kind).toBe("quote");
    if (quote.kind !== "quote") throw new Error("expected quote");
    expect(quote.blocks[0]).toMatchObject({ kind: "paragraph" });
  });
});

describe("parseLatex — math blocks and code", () => {
  it("collects a display equation verbatim", () => {
    const [math] = parseLatex("\\begin{equation}\na^2 + b^2 = c^2\n\\end{equation}").blocks;

    expect(math).toMatchObject({ kind: "math", display: true });
    if (math.kind !== "math") throw new Error("expected math");
    expect(math.latex).toBe("a^2 + b^2 = c^2");
  });

  it("handles \\[ ... \\] on one line and across lines", () => {
    expect(parseLatex("\\[ x = 1 \\]").blocks[0]).toMatchObject({ kind: "math" });
    const [multi] = parseLatex("\\[\na = b\n\\]").blocks;
    if (multi.kind !== "math") throw new Error("expected math");
    expect(multi.latex).toBe("a = b");
  });

  it("keeps verbatim content untouched, including comments and commands", () => {
    const source = "\\begin{verbatim}\n\\section{不是标题} % 也不是注释\n\\end{verbatim}";
    const [code] = parseLatex(source).blocks;

    expect(code.kind).toBe("code");
    if (code.kind !== "code") throw new Error("expected code");
    expect(code.text).toBe("\\section{不是标题} % 也不是注释");
  });
});

describe("parseLatex — diagnostics", () => {
  it("reports an unsupported text command with its line", () => {
    const { diagnostics } = parseLatex("正文\n见 \\cite{key} 处");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ line: 2, command: "\\cite" });
  });

  it("does not warn about harmless spacing and line-break commands", () => {
    const { diagnostics } = parseLatex("字体 \\, 间距 \\quad 换行 \\\\ 结束");

    expect(diagnostics).toEqual([]);
  });

  it("does not inspect math internals", () => {
    const { diagnostics } = parseLatex("$\\unknownmathtoken{x}$");

    expect(diagnostics).toEqual([]);
  });

  it("reports an unsupported environment", () => {
    const { diagnostics, blocks } = parseLatex("\\begin{figure}\n\\caption{x}\n\\end{figure}");

    expect(diagnostics[0].command).toBe("\\begin{figure}");
    expect(blocks[0].kind).toBe("unsupported");
  });

  it("notes a skipped preamble instead of warning per package", () => {
    const source = [
      "\\documentclass{article}",
      "\\usepackage{amsmath}",
      "\\begin{document}",
      "正文",
      "\\end{document}",
    ].join("\n");
    const { diagnostics, blocks } = parseLatex(source);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("前言区");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph"]);
  });
});
