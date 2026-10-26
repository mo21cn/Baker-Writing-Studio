import { describe, expect, it } from "vitest";
import { parseLatex } from "../src/core/latex/parseLatex";
import { blocksToMarkdown } from "../src/core/latex/toMarkdown";

const toMd = (source: string) => blocksToMarkdown(parseLatex(source).blocks);

describe("blocksToMarkdown", () => {
  it("converts sections to headings and keeps numbering out of the syntax", () => {
    expect(toMd("\\section{引言}\n正文")).toBe("# 引言\n\n正文");
    expect(toMd("\\subsection*{背景}")).toBe("## 背景");
  });

  it("converts display math to $$ blocks and inline math to $ pairs", () => {
    expect(toMd("\\begin{equation}\na = b\n\\end{equation}")).toBe("$$\na = b\n$$");
    expect(toMd("质能 $E = mc^2$ 方程")).toBe("质能 $E = mc^2$ 方程");
  });

  it("converts itemize and enumerate", () => {
    expect(toMd("\\begin{itemize}\n\\item 甲\n\\item 乙\n\\end{itemize}")).toBe("- 甲\n- 乙");
    expect(toMd("\\begin{enumerate}\n\\item 一\n\\end{enumerate}")).toBe("1. 一");
  });

  it("converts quotes and verbatim to Markdown fences", () => {
    expect(toMd("\\begin{quote}\n引用\n\\end{quote}")).toBe("> 引用");
    expect(toMd("\\begin{verbatim}\nlet a = 1\n\\end{verbatim}")).toBe(
      "```\nlet a = 1\n```",
    );
  });

  it("keeps math bodies verbatim and unsupported commands as comments", () => {
    const md = toMd("$$\n\\alpha_1 + \\beta_2\n$$\n\n\\begin{figure}\n\\end{figure}");

    expect(md).toContain("$$\n\\alpha_1 + \\beta_2\n$$");
    expect(md).toContain("<!-- 不支持 \\begin{figure}（第 5 行） -->");
  });

  it("escapes text that would become Markdown syntax", () => {
    expect(toMd("价格 \\$5 与 a\\_b")).toBe("价格 \\$5 与 a\\_b");
  });
});
