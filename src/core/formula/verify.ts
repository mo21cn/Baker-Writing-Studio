/**
 * Tiny verification harness for the formula module. Run with:
 *   npx tsx src/core/formula/verify.ts
 */
import { serializeFormula, stripWrapper } from "./serializer";

interface Check {
  name: string;
  expected: string;
  actual: string;
}

const checks: Check[] = [
  {
    name: "strip wrapper on inline",
    expected: "a + b",
    actual: stripWrapper("$ a + b $"),
  },
  {
    name: "strip wrapper on display",
    expected: "a + b",
    actual: stripWrapper("$$ a + b $$"),
  },
  {
    name: "strip wrapper leaves bare alone",
    expected: "\\frac{a}{b}",
    actual: stripWrapper("\\frac{a}{b}"),
  },
  {
    name: "serialize inline",
    expected: "$\\frac{a}{b}$",
    actual: serializeFormula({ latex: "\\frac{a}{b}" }, "inline").wrapped,
  },
  {
    name: "serialize display",
    expected: "$$a + b$$",
    actual: serializeFormula({ latex: "a + b" }, "display").wrapped,
  },
  {
    name: "serialize no wrap",
    expected: "\\frac{a}{b}",
    actual: serializeFormula({ latex: "\\frac{a}{b}" }, "none").wrapped,
  },
  {
    name: "toggle from inline to display",
    expected: "$$a + b$$",
    actual: serializeFormula({ latex: "$ a + b $" }, "display").wrapped,
  },
  {
    name: "strip displaystyle placeholder",
    expected: "a",
    actual: serializeFormula({ latex: "\\displaystyle{}a" }, "none").bare,
  },
];

let failed = 0;
for (const check of checks) {
  const ok = check.expected === check.actual;
  if (ok) {
    // eslint-disable-next-line no-console
    console.log(`PASS  ${check.name}`);
  } else {
    failed += 1;
    // eslint-disable-next-line no-console
    console.log(`FAIL  ${check.name}`);
    // eslint-disable-next-line no-console
    console.log(`  expected: ${check.expected}`);
    // eslint-disable-next-line no-console
    console.log(`  actual:   ${check.actual}`);
  }
}

if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failed} of ${checks.length} formula checks failed.`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`\nAll ${checks.length} formula checks passed.`);
