import type { TableModel } from "./model";
import { normalizeTable } from "./model";

export type TableFormat = "markdown" | "latex" | "csv" | "html";

export function serializeTable(model: TableModel, format: TableFormat): string {
  const normalized = normalizeTable(model);
  switch (format) {
    case "markdown":
      return toMarkdown(normalized);
    case "latex":
      return toLatexTabular(normalized);
    case "csv":
      return toCsv(normalized);
    case "html":
      return toHtmlTable(normalized);
    default:
      return "";
  }
}

const PIPE = String.fromCharCode(124);
const AMP = String.fromCharCode(38);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const QUOT = String.fromCharCode(34);

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes(QUOT) || value.includes("\n")) {
    const escaped = value.replace(/"/g, QUOT + QUOT);
    return QUOT + escaped + QUOT;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, AMP + "amp;")
    .replace(/</g, LT + "lt;")
    .replace(/>/g, GT + "gt;")
    .replace(/"/g, QUOT + "quot;");
}

/**
 * Build a GFM-aligned markdown table.
 *
 * Column widths are computed from the longest cell content so cells read as a
 * visual grid, but each cell is wrapped in a single space on each side and the
 * separator line uses exactly three dashes per column. This keeps the output
 * round-trip safe with every GFM renderer (GitHub, Obsidian, VS Code, …).
 */
function toMarkdown(model: TableModel): string {
  const { cells, cols, headerRow } = model;
  if (cells.length === 0) {
    return "";
  }

  const headerSource = headerRow ? cells[0] : null;
  const bodyStart = headerRow ? 1 : 0;
  const columnCount = cols;

  const widths = Array.from({ length: columnCount }, (_, col) => {
    let widest = 3;
    if (headerSource) {
      widest = Math.max(widest, escapeMarkdownCell(headerSource[col] ?? "").length);
    }
    for (let row = bodyStart; row < cells.length; row += 1) {
      const display = escapeMarkdownCell(cells[row][col] ?? "");
      widest = Math.max(widest, display.length);
    }
    return widest;
  });

  const formatCell = (value: string, width: number): string => {
    const display = escapeMarkdownCell(value);
    const padding = " ".repeat(Math.max(0, width - display.length));
    return " " + display + padding + " ";
  };

  const lines: string[] = [];

  if (headerSource) {
    const headerCells = widths.map((width, col) => formatCell(headerSource[col] ?? "", width));
    lines.push(PIPE + headerCells.join(PIPE) + PIPE);
    const separator = widths.map(() => "---").join(PIPE);
    lines.push(PIPE + separator + PIPE);
  } else {
    const placeholder = widths.map(() => " ").join(PIPE);
    lines.push(PIPE + placeholder + PIPE);
    const separator = widths.map(() => "---").join(PIPE);
    lines.push(PIPE + separator + PIPE);
  }

  for (let row = bodyStart; row < cells.length; row += 1) {
    const rowCells = widths.map((width, col) => formatCell(cells[row][col] ?? "", width));
    lines.push(PIPE + rowCells.join(PIPE) + PIPE);
  }

  return lines.join("\n");
}

function toLatexTabular(model: TableModel): string {
  const { cells, cols, headerRow } = model;
  if (cells.length === 0) {
    return "\\begin{tabular}{l}\n\\end{tabular}";
  }

  const columnSpec = Array.from({ length: cols }, () => "l").join("|");
  const lines: string[] = [];
  lines.push("\\begin{tabular}{" + columnSpec + "}");
  lines.push("\\hline");

  const renderRow = (row: number): string =>
    Array.from({ length: cols }, (_, col) => escapeLatex(cells[row][col] ?? "")).join(" & ");

  if (headerRow && cells.length > 0) {
    lines.push(renderRow(0) + " \\\\");
    lines.push("\\hline");
    for (let row = 1; row < cells.length; row += 1) {
      lines.push(renderRow(row) + " \\\\");
    }
  } else {
    for (let row = 0; row < cells.length; row += 1) {
      lines.push(renderRow(row) + " \\\\");
    }
  }

  lines.push("\\hline");
  lines.push("\\end{tabular}");
  return lines.join("\n");
}

function toCsv(model: TableModel): string {
  const { cells } = model;
  if (cells.length === 0) {
    return "";
  }
  return cells.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function toHtmlTable(model: TableModel): string {
  const { cells, cols, headerRow } = model;
  if (cells.length === 0) {
    return "<table></table>";
  }

  const lines: string[] = ["<table>"];
  const renderCell = (value: string, tag: "th" | "td"): string =>
    "<" + tag + ">" + escapeHtml(value) + "</" + tag + ">";

  if (headerRow && cells.length > 0) {
    lines.push("  <thead><tr>");
    for (let col = 0; col < cols; col += 1) {
      lines.push("    " + renderCell(cells[0][col] ?? "", "th"));
    }
    lines.push("  </tr></thead>");
    lines.push("  <tbody>");
    for (let row = 1; row < cells.length; row += 1) {
      lines.push("    <tr>");
      for (let col = 0; col < cols; col += 1) {
        lines.push("      " + renderCell(cells[row][col] ?? "", "td"));
      }
      lines.push("    </tr>");
    }
    lines.push("  </tbody>");
  } else {
    lines.push("  <tbody>");
    for (let row = 0; row < cells.length; row += 1) {
      lines.push("    <tr>");
      for (let col = 0; col < cols; col += 1) {
        lines.push("      " + renderCell(cells[row][col] ?? "", "td"));
      }
      lines.push("    </tr>");
    }
    lines.push("  </tbody>");
  }

  lines.push("</table>");
  return lines.join("\n");
}
