/**
 * Finds block-level Markdown structures the editor can preview underneath
 * the source: tables and fenced code blocks.
 *
 * Pure and line-based on purpose — the CodeMirror layer only needs line
 * indices, and this keeps the rules testable without a DOM.
 */

export type TableAlignment = "left" | "center" | "right";

export type BlockPreview =
  | {
      kind: "table";
      startLine: number;
      endLine: number;
      rows: string[][];
      alignments: TableAlignment[];
    }
  | {
      kind: "code";
      startLine: number;
      endLine: number;
      language: string;
      code: string;
    };

const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** GFM tables may omit the outer pipes, so a row is any line with a `|`. */
function isTableRow(line: string): boolean {
  return line.includes("|") && line.trim() !== "";
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function parseAlignments(line: string): TableAlignment[] {
  return splitRow(line).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

export function findBlockPreviews(lines: string[]): BlockPreview[] {
  const found: BlockPreview[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      const marker = fence[1];
      const language = fence[2] ?? "";
      let end = index + 1;
      while (end < lines.length) {
        const closing = lines[end].trim();
        if (closing.startsWith(marker[0].repeat(marker.length)) && /^[`~]+\s*$/.test(closing)) break;
        end += 1;
      }

      // An unterminated fence is still being typed; previewing it would
      // flicker on every keystroke.
      if (end < lines.length) {
        found.push({
          kind: "code",
          startLine: index,
          endLine: end,
          language,
          code: lines.slice(index + 1, end).join("\n"),
        });
        index = end + 1;
        continue;
      }
      break;
    }

    if (isTableRow(line) && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1])) {
      let end = index + 1;
      while (end + 1 < lines.length && isTableRow(lines[end + 1])) end += 1;

      const rows = lines.slice(index, end + 1).map(splitRow);
      found.push({
        kind: "table",
        startLine: index,
        endLine: end,
        rows: [rows[0], ...rows.slice(2)],
        alignments: parseAlignments(lines[index + 1]),
      });
      index = end + 1;
      continue;
    }

    index += 1;
  }

  return found;
}
