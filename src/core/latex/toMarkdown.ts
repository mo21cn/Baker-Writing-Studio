import type { BlockNode, InlineNode } from "./model";

/**
 * Blocks → Markdown, so「插入到正文」lands content the Markdown pipeline can
 * actually render: `\[...\]` becomes `$$...$$`, `\section{}` becomes `#`,
 * itemize becomes `- `. Math bodies are passed through untouched.
 */

const SEP = "\u0001";

/** Escapes the characters that would otherwise become Markdown syntax. */
function escapeText(value: string): string {
  return value
    .split(SEP)
    .join(" ")
    .replace(/\$/g, "\\$")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .split("\n")
    .join("  \n");
}

function inline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return escapeText(node.text);
        case "code": {
          const fence = node.text.includes("`") ? "``" : "`";
          return `${fence}${node.text}${fence}`;
        }
        case "strong":
          return `**${inline(node.children)}**`;
        case "emph":
          return `*${inline(node.children)}*`;
        case "math":
          return `$${node.latex}$`;
        case "unsupported":
          return node.command;
      }
    })
    .join("");
}

function indent(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line) => (line.trim().length > 0 ? prefix + line : line))
    .join("\n");
}

function block(node: BlockNode, depth: number): string {
  const pad = "  ".repeat(depth);

  switch (node.kind) {
    case "heading": {
      const hashes = "#".repeat(node.level);
      return `${pad}${hashes} ${inline(node.children)}`;
    }
    case "paragraph":
      return `${pad}${inline(node.children)}`;
    case "list": {
      const marker = node.ordered ? "1." : "-";
      return node.items
        .map((item) => {
          const body = item
            .map((inner) => block(inner, inner.kind === "list" ? depth + 1 : depth))
            .join("\n");
          return `${pad}${marker} ${body}`;
        })
        .join("\n");
    }
    case "quote":
      return indent(
        node.blocks.map((inner) => block(inner, depth)).join("\n"),
        "> ",
      );
    case "code": {
      const fence = "```";
      const language = node.language ? node.language : "";
      return `${pad}${fence}${language}\n${node.text}\n${pad}${fence}`;
    }
    case "math":
      return `${pad}$$\n${node.latex}\n${pad}$$`;
    case "unsupported":
      return `${pad}<!-- 不支持 ${node.command}（第 ${node.line} 行） -->`;
  }
}

export function blocksToMarkdown(blocks: BlockNode[]): string {
  return blocks.map((node) => block(node, 0)).join("\n\n");
}
