import { describe, expect, it } from "vitest";
import { parseLatex } from "../src/core/latex/parseLatex";
import { renderBlocks } from "../src/core/latex/render";

const stub = { math: () => "<svg></svg>" };

describe("inline unsupported commands", () => {
  it("keeps the command in the stream and marks it in the preview", () => {
    const { blocks } = parseLatex("见 \\cite{key} 处");

    const html = renderBlocks(blocks, stub);
    expect(html).toContain('<span class="latex-unsupported-inline" title="不支持的命令">\\cite</span>');
    expect(html).toContain("见 ");
    expect(html).toContain(" 处");
  });

  it("still reports the diagnostic once", () => {
    const { diagnostics } = parseLatex("见 \\cite{key} 处");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].command).toBe("\\cite");
  });
});
