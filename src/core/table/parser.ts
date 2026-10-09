import type { TableModel } from "./model";
import { normalizeTable } from "./model";

export type ImportFormat = "tsv" | "csv" | "html" | "auto";

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim());
}

/**
 * Best-effort CSV line split with quoted-field support.
 * Implements RFC 4180 enough for our purposes: quotes wrap a field,
 * embedded quotes are doubled, and newlines inside quotes are kept.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (inQuotes) {
      if (char === "\"") {
        if (line[index + 1] === "\"") {
          current += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
}

function detectFormat(input: string): ImportFormat {
  const trimmed = input.trim();
  if (!trimmed) {
    return "tsv";
  }
  if (HTML_TAG_RE.test(trimmed)) {
    return "html";
  }
  if (trimmed.includes("\t")) {
    return "tsv";
  }
  return "csv";
}

export function parseClipboardTable(input: string, format: ImportFormat = "auto"): TableModel {
  const normalized = input.replace(/\r\n?/g, "\n");
  const effective = format === "auto" ? detectFormat(normalized) : format;

  if (effective === "html") {
    return parseHtmlTable(normalized);
  }

  const delimiter = effective === "csv" ? "," : "\t";
  const split = effective === "csv" ? splitCsvLine : (line: string) => splitLine(line, delimiter);

  const rows = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(split);

  if (rows.length === 0) {
    return normalizeTable({ cells: [[""]], cols: 1, headerRow: true });
  }

  return normalizeTable({ cells: rows, cols: rows[0]?.length ?? 1, headerRow: true });
}

export function parseHtmlTable(html: string): TableModel {
  if (typeof DOMParser === "undefined") {
    throw new Error("当前环境不支持 HTML 解析。");
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const table = document.querySelector("table");
  if (!table) {
    throw new Error("未在剪贴板内容中找到 <table>。");
  }

  const rows: string[][] = [];
  for (const row of Array.from(table.querySelectorAll("tr"))) {
    const cells = Array.from(row.querySelectorAll("th, td")).map((cell) =>
      cell.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return normalizeTable({ cells: [[""]], cols: 1, headerRow: true });
  }

  const firstHasHeader = table.querySelector("tr")?.querySelector("th") !== null;
  return normalizeTable({ cells: rows, cols: rows[0]?.length ?? 1, headerRow: firstHasHeader });
}
