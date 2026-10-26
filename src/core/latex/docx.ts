import { HeadingLevel, Paragraph, Run, TextRun } from "docx";
import { Math as DocxMath, latexToMath } from "docx/math";
import type { BlockNode, InlineNode } from "./model";

/**
 * Blocks → docx paragraphs, so "转 Word" exports the document the author
 * wrote instead of only its first formula.
 *
 * Formulas become native OMML; when `latexToMath` cannot handle an
 * expression the caller supplies a fallback that embeds the rendered SVG as
 * an image, so one difficult formula cannot fail the whole document.
 */

export interface DocxRenderOptions {
  /** Called when a formula cannot be converted; return a paragraph or null. */
  mathFallback?: (latex: string) => Promise<Paragraph | null>;
}

const BULLET = { bullet: { level: 0 } } as const;
const BULLET_NESTED = { bullet: { level: 1 } } as const;

function inlineRuns(nodes: InlineNode[]): Array<Run | TextRun> {
  const runs: Array<Run | TextRun> = [];

  for (const node of nodes) {
    switch (node.kind) {
      case "text": {
        // `\u0001` joins source lines; `\n` is an explicit `\\` break.
        const parts = node.text.split("\u0001").join(" ").split("\n");
        parts.forEach((part, index) => {
          if (index > 0) runs.push(new TextRun({ break: 1 }));
          if (part) runs.push(new TextRun(part));
        });
        break;
      }
      case "code":
        runs.push(new TextRun({ text: node.text, font: "Consolas" }));
        break;
      case "strong":
        runs.push(
          new TextRun({
            text: plainText(node.children),
            bold: true,
          }),
        );
        break;
      case "emph":
        runs.push(new TextRun({ text: plainText(node.children), italics: true }));
        break;
      case "unsupported":
        runs.push(new TextRun({ text: node.command, color: "A3542D" }));
        break;
      case "math":
        try {
          runs.push(
            new Run({ children: [new DocxMath({ children: latexToMath(node.latex) })] }),
          );
        } catch {
          runs.push(new TextRun({ text: node.latex, font: "Consolas" }));
        }
        break;
    }
  }

  return runs;
}

/** Flattens inline nodes for run-level formatting (Word cannot nest runs). */
function plainText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text" || node.kind === "code") return node.text;
      if (node.kind === "math") return node.latex;
      if (node.kind === "unsupported") return node.command;
      return plainText(node.children);
    })
    .join("")
    .split("\u0001")
    .join(" ")
    .split("\n")
    .join(" ");
}

async function mathParagraph(
  latex: string,
  options: DocxRenderOptions,
): Promise<Paragraph | null> {
  try {
    return new Paragraph({
      alignment: "center",
      children: [new Run({ children: [new DocxMath({ children: latexToMath(latex) })] })],
    });
  } catch {
    return options.mathFallback ? options.mathFallback(latex) : null;
  }
}

async function blocksToParagraphs(
  blocks: BlockNode[],
  options: DocxRenderOptions,
  depth: number,
): Promise<Paragraph[]> {
  const out: Paragraph[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case "heading": {
        const heading =
          block.level === 1
            ? HeadingLevel.HEADING_1
            : block.level === 2
              ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3;
        out.push(new Paragraph({ heading, children: inlineRuns(block.children) }));
        break;
      }
      case "paragraph":
        out.push(
          new Paragraph({
            children: inlineRuns(block.children),
            ...(depth > 0 ? { indent: { left: 240 * depth } } : {}),
          }),
        );
        break;
      case "list": {
        const bullet = depth === 0 ? BULLET : BULLET_NESTED;
        for (const item of block.items) {
          const [first, ...rest] = item;

          if (first?.kind === "paragraph") {
            out.push(new Paragraph({ ...bullet, children: inlineRuns(first.children) }));
          } else {
            out.push(new Paragraph({ text: "", ...bullet }));
            if (first) rest.push(first);
          }

          if (rest.length > 0) {
            out.push(...(await blocksToParagraphs(rest, options, depth + 1)));
          }
        }
        break;
      }
      case "quote": {
        const inner = await blocksToParagraphs(block.blocks, options, depth + 1);
        out.push(...inner);
        break;
      }
      case "code":
        out.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, font: "Consolas", size: 20 })],
          }),
        );
        break;
      case "math": {
        const paragraph = await mathParagraph(block.latex, options);
        if (paragraph) out.push(paragraph);
        break;
      }
      case "unsupported":
        out.push(
          new Paragraph({
            children: [new TextRun({ text: `[不支持] ${block.command}（第 ${block.line} 行）`, color: "999999" })],
          }),
        );
        break;
    }
  }

  return out;
}

export async function blocksToDocxParagraphs(
  blocks: BlockNode[],
  options: DocxRenderOptions = {},
): Promise<Paragraph[]> {
  return blocksToParagraphs(blocks, options, 0);
}
