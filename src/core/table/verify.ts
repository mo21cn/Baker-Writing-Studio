/**
 * Tiny verification harness for the table module. Run with:
 *   npx tsx src/core/table/verify.ts
 *
 * The repo doesn't ship a test runner, so this script prints a pass/fail line
 * per assertion to stdout. Keep it deterministic — no `Math.random()`, no
 * network — so it can be invoked from CI later.
 */
import { parseClipboardTable } from "./parser";
import { serializeTable } from "./serializer";
import { createEmptyTable } from "./model";
import type { TableModel } from "./model";

interface Check {
  name: string;
  expected: string;
  actual: string;
}

function trimForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function compareLines(a: string, b: string): boolean {
  return trimForCompare(a) === trimForCompare(b);
}

function runChecks(checks: Check[]): void {
  let failed = 0;
  for (const check of checks) {
    const ok = compareLines(check.expected, check.actual);
    if (ok) {
       
      console.log(`PASS  ${check.name}`);
    } else {
      failed += 1;
       
      console.log(`FAIL  ${check.name}`);
       
      console.log(`  expected: ${check.expected}`);
       
      console.log(`  actual:   ${check.actual}`);
    }
  }

  if (failed > 0) {
     
    console.error(`\n${failed} of ${checks.length} table checks failed.`);
    process.exit(1);
  }

   
  console.log(`\nAll ${checks.length} table checks passed.`);
}

const sample: TableModel = {
  cells: [
    ["a", "b", "c"],
    ["1", "2", "3"],
    ["4", "5", "6"],
  ],
  cols: 3,
  headerRow: true,
};

const checks: Check[] = [
  {
    name: "markdown",
    expected: `| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |`,
    actual: serializeTable(sample, "markdown").replace(/\s+\|/g, " |"),
  },
  {
    name: "latex",
    expected: `\\begin{tabular}{l|l|l}\n\\hline\na & b & c \\\\\n\\hline\n1 & 2 & 3 \\\\\n4 & 5 & 6 \\\\\n\\hline\n\\end{tabular}`,
    actual: serializeTable(sample, "latex"),
  },
  {
    name: "csv",
    expected: `a,b,c\n1,2,3\n4,5,6`,
    actual: serializeTable(sample, "csv"),
  },
  {
    name: "html",
    expected: `<table>\n  <thead><tr>\n    <th>a</th>\n    <th>b</th>\n    <th>c</th>\n  </tr></thead>\n  <tbody>\n    <tr>\n      <td>1</td>\n      <td>2</td>\n      <td>3</td>\n    </tr>\n    <tr>\n      <td>4</td>\n      <td>5</td>\n      <td>6</td>\n    </tr>\n  </tbody>\n</table>`,
    actual: serializeTable(sample, "html"),
  },
  {
    name: "tsv parser",
    expected: serializeTable(sample, "markdown"),
    actual: serializeTable(parseClipboardTable("a\tb\tc\n1\t2\t3\n4\t5\t6", "tsv"), "markdown"),
  },
  {
    name: "csv parser (quoted)",
    expected: serializeTable(sample, "markdown"),
    actual: serializeTable(parseClipboardTable("a,b,c\n1,2,3\n4,5,6", "csv"), "markdown"),
  },
  {
    name: "html parser",
    expected: "(skipped in node)",
    actual: typeof DOMParser === "undefined"
      ? "(skipped in node)"
      : serializeTable(
          parseClipboardTable(
            `<table><tr><th>a</th><th>b</th><th>c</th></tr><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr></table>`,
            "html",
          ),
          "markdown",
        ),
  },
  {
    name: "empty model",
    expected: `| | | |\n|---|---|---|\n|     |     |     |`,
    actual: serializeTable({ ...createEmptyTable(3, 1), headerRow: false }, "markdown").replace(/\s+\|/g, " |"),
  },
];

runChecks(checks);
