import type { BlockNode, InlineNode } from "./model";

/**
 * Blocks → HTML for the preview pane.
 *
 * Text is escaped here; math is injected as SVG by the caller, so this module
 * never has to touch MathJax (and stays testable with a stub).
 */

export interface RenderOptions {
  /** Returns an `<svg>` string, or null when the expression failed. */
  math: (latex: string, display: boolean) => string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `\u0001` separates wrapped source lines; `\n` is an explicit `\\` break. */
function textToHtml(value: string): string {
  return escapeHtml(value)
    .split("\u0001")
    .join(" ")
    .split("\n")
    .join("<br>");
}

function inlineToHtml(nodes: InlineNode[], options: RenderOptions): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return textToHtml(node.text);
        case "code":
          return `<code>${escapeHtml(node.text)}</code>`;
        case "strong":
          return `<strong>${inlineToHtml(node.children, options)}</strong>`;
        case "emph":
          return `<em>${inlineToHtml(node.children, options)}</em>`;
        case "unsupported":
          return `<span class="latex-unsupported-inline" title="不支持的命令">${escapeHtml(node.command)}</span>`;
        case "math": {
          const svg = options.math(node.latex, false);
          return svg
            ? `<span class="latex-math">${svg}</span>`
            : `<code class="latex-math-error" title="${escapeHtml(node.latex)}">${escapeHtml(node.latex)}</code>`;
        }
      }
    })
    .join("");
}

function blockToHtml(block: BlockNode, options: RenderOptions, depth: number): string {
  switch (block.kind) {
    case "heading": {
      const level = Math.min(6, block.level + 1);
      const number = block.numbered ? "" : ' data-unnumbered="true"';
      return `<h${level}${number}>${inlineToHtml(block.children, options)}</h${level}>`;
    }
    case "paragraph":
      return `<p>${inlineToHtml(block.children, options)}</p>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map((item) => `<li>${item.map((block) => blockToHtml(block, options, depth + 1)).join("")}</li>`)
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "quote":
      return `<blockquote>${block.blocks.map((inner) => blockToHtml(inner, options, depth + 1)).join("")}</blockquote>`;
    case "code":
      return `<pre class="latex-code"><code>${escapeHtml(block.text)}</code></pre>`;
    case "math": {
      const svg = options.math(block.latex, true);
      return svg
        ? `<div class="latex-math-block">${svg}</div>`
        : `<pre class="latex-math-error">${escapeHtml(block.latex)}</pre>`;
    }
    case "unsupported":
      return `<p class="latex-unsupported">不支持：<code>${escapeHtml(block.command)}</code>（第 ${block.line} 行）</p>`;
  }
}

export function renderBlocks(blocks: BlockNode[], options: RenderOptions): string {
  return blocks.map((block) => blockToHtml(block, options, 0)).join("\n");
}
