// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeRenderedHtml } from "./sanitizeHtml";
import { renderMarkdown } from "./renderMarkdown";

const FORMULA =
  '<section class="baker-formula-block"><svg viewBox="0 0 120 40" data-mml-node="math"><g data-mml-node="mi"><path d="M10 10 L20 20" fill="currentColor"/></g></svg></section>';

describe("sanitizeRenderedHtml", () => {
  it("removes script tags and their content", () => {
    const clean = sanitizeRenderedHtml('<p>hi</p><script>window.stolen = 1</script>');
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("window.stolen");
  });

  it("strips inline event handlers", () => {
    const clean = sanitizeRenderedHtml('<img src="x" onerror="alert(1)" onload="alert(2)">');
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("onload");
  });

  it("drops javascript: URLs", () => {
    const clean = sanitizeRenderedHtml('<a href="javascript:alert(1)">click</a>');
    expect(clean).not.toContain("javascript:");
  });

  it("removes iframes and forms", () => {
    const clean = sanitizeRenderedHtml('<iframe src="https://evil.test"></iframe><form action="/x"></form>');
    expect(clean).not.toContain("<iframe");
    expect(clean).not.toContain("<form");
  });

  it("leaves MathJax formula markup byte-identical", () => {
    const clean = sanitizeRenderedHtml(`${FORMULA}<p>text</p>`);
    expect(clean).toContain(FORMULA);
  });

  it("keeps the markup a themed article needs", () => {
    const html =
      '<h2 id="a">t</h2><div class="baker-table-scroll"><table><tr><td style="color:red">x</td></tr></table></div>' +
      '<a href="https://example.com" target="_blank" rel="noopener">link</a>' +
      '<span data-baker-image="inlined">img</span>';
    const clean = sanitizeRenderedHtml(html);
    expect(clean).toContain('class="baker-table-scroll"');
    expect(clean).toContain('style="color:red"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain("data-baker-image");
    expect(clean).toContain("https://example.com");
  });
});

describe("renderMarkdown output", () => {
  it("never emits executable markup", () => {
    const { rawHtml } = renderMarkdown({
      markdown: [
        "# Title",
        "",
        '<img src="x" onerror="alert(1)">',
        "",
        "<script>alert(2)</script>",
        "",
        '<a href="javascript:alert(3)">bad</a>',
      ].join("\n"),
    });
    expect(rawHtml).not.toContain("onerror");
    expect(rawHtml).not.toContain("<script");
    expect(rawHtml).not.toContain("javascript:");
    expect(rawHtml).toContain("<h1");
  });

  it("still renders formulas, tables and code fences", () => {
    const { rawHtml } = renderMarkdown({
      markdown: [
        "$$",
        "E = mc^2",
        "$$",
        "",
        "| a | b |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "```ts",
        "const a = 1;",
        "```",
      ].join("\n"),
    });
    expect(rawHtml).toContain("baker-formula-block");
    expect(rawHtml).toContain("<svg");
    expect(rawHtml).toContain("baker-table-scroll");
    expect(rawHtml).toContain("language-ts");
  });
});
