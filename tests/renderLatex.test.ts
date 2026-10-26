import { describe, expect, it } from "vitest";
import { parseLatex } from "../src/core/latex/parseLatex";
import { renderBlocks, type RenderOptions } from "../src/core/latex/render";

const stubMath: RenderOptions = {
  math: (latex, display) => `<svg data-display="${display}" data-tex="${latex}"></svg>`,
};

const render = (source: string) => renderBlocks(parseLatex(source).blocks, stubMath);

describe("renderBlocks — structure", () => {
  it("renders headings one level deeper than the source", () => {
    expect(render("\\section{标题}")).toBe("<h2>标题</h2>");
    expect(render("\\subsection{子标题}")).toBe("<h3>子标题</h3>");
  });

  it("renders nested lists", () => {
    const html = render(
      ["\\begin{itemize}", "\\item 外层", "\\begin{itemize}", "\\item 内层", "\\end{itemize}", "\\end{itemize}"].join("\n"),
    );

    expect(html).toContain("<ul><li><p>外层</p><ul><li><p>内层</p></li></ul></li></ul>");
  });

  it("renders quotes and code fences", () => {
    expect(render("\\begin{quote}\n引用\n\\end{quote}")).toBe("<blockquote><p>引用</p></blockquote>");
    expect(render("\\begin{verbatim}\nlet a = 1\n\\end{verbatim}")).toBe(
      '<pre class="latex-code"><code>let a = 1</code></pre>',
    );
  });
});

describe("renderBlocks — inline", () => {
  it("escapes text and keeps inline math as SVG", () => {
    const html = render("a < b & c $x^2$");

    expect(html).toContain("a &lt; b &amp; c");
    expect(html).toContain('<span class="latex-math"><svg data-display="false" data-tex="x^2"></svg></span>');
  });

  it("wraps emphasis and code", () => {
    expect(render("\\textbf{粗} \\emph{斜} \\texttt{a<b}")).toBe(
      "<p><strong>粗</strong> <em>斜</em> <code>a&lt;b</code></p>",
    );
  });

  it("turns \\\\ into a line break", () => {
    expect(render("第一行 \\\\ 第二行")).toBe("<p>第一行 <br> 第二行</p>");
  });
});

describe("renderBlocks — failures", () => {
  it("falls back to code when math cannot render", () => {
    const html = renderBlocks(parseLatex("$\\broken{x}$").blocks, { math: () => null });

    expect(html).toContain('class="latex-math-error"');
  });

  it("shows unsupported blocks with their line", () => {
    const html = render("\\begin{figure}\n\\end{figure}");

    expect(html).toContain("不支持：<code>\\begin{figure}</code>");
  });
});
