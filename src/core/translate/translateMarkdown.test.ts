import { describe, expect, it } from "vitest";
import {
  detectDominantLanguage,
  isAbortError,
  translateMarkdown,
} from "./translateMarkdown";
import { splitForRequest, type Translator } from "./googleTranslator";
import { planDocument } from "./markdownSegments";

const identity: Translator = async (text) => text;

const DOC = [
  "---",
  "title: Getting Started",
  "---",
  "",
  "# Getting Started",
  "",
  "Use `npm run dev` to start. See [the guide](https://example.com/a_(b)).",
  "",
  "- first item",
  "- second item",
  "",
  "| Name | Value |",
  "| --- | --- |",
  "| speed | fast |",
  "",
  "```js",
  "const a = 1;",
  "```",
  "",
  "$$",
  "E = mc^2",
  "$$",
  "",
  "Money: $5 and $6 only.",
].join("\n");

describe("translateMarkdown round trip", () => {
  it("keeps the document byte-identical when the engine echoes its input", async () => {
    const result = await translateMarkdown(DOC, "zh", { translator: identity });
    expect(result.text).toBe(DOC);
    expect(result.warnings).toEqual([]);
    expect(result.stats.failed).toBe(0);
  });

  it("never sends fenced code, front matter or table separators to the engine", async () => {
    const seen: string[] = [];
    const recorder: Translator = async (text) => {
      seen.push(text);
      return text;
    };
    await translateMarkdown(DOC, "zh", { translator: recorder });

    const payload = seen.join("\n");
    expect(payload).not.toContain("const a = 1");
    expect(payload).not.toContain("title: Getting Started");
    expect(payload).not.toContain("| --- | --- |");
    // Prose still goes through.
    expect(payload).toContain("Getting Started");
  });

  it("protects inline code, links and formulas from the engine", async () => {
    const seen: string[] = [];
    const recorder: Translator = async (text) => {
      seen.push(text);
      return text;
    };
    await translateMarkdown(DOC, "zh", { translator: recorder });

    const payload = seen.join("\n");
    expect(payload).not.toContain("npm run dev");
    expect(payload).not.toContain("https://example.com");
    expect(payload).not.toContain("mc^2");
  });
});

describe("language skipping", () => {
  it("still sends lines that mix Chinese with English tokens", async () => {
    const seen: string[] = [];
    const recorder: Translator = async (text) => {
      seen.push(text);
      return text;
    };
    await translateMarkdown("- Markdown 编辑\n\nPlain English line.", "en", {
      translator: recorder,
    });
    expect(seen.join("\n")).toContain("Markdown 编辑");
  });

  it("does not send lines that are already Chinese", async () => {
    const seen: string[] = [];
    const recorder: Translator = async (text) => {
      seen.push(text);
      return text;
    };
    await translateMarkdown("# 中文标题\n\n这是一段完全中文的正文内容。", "zh", {
      translator: recorder,
    });
    expect(seen).toEqual([]);
  });
});

describe("batching", () => {  it("packs short lines into fewer requests", async () => {
    const doc = Array.from({ length: 20 }, (_, index) => `Paragraph number ${index} is short.`).join(
      "\n\n",
    );
    let calls = 0;
    const counting: Translator = async (text) => {
      calls += 1;
      return text;
    };
    const result = await translateMarkdown(doc, "zh", { translator: counting });
    expect(calls).toBeLessThan(20);
    expect(calls).toBeGreaterThan(0);
    expect(result.text).toBe(doc);
  });

  it("falls back to per-line requests when the engine reflows separators", async () => {
    const doc = ["Alpha line.", "", "Beta line.", "", "Gamma line."].join("\n");
    const calls: string[] = [];
    const hostile: Translator = async (text) => {
      calls.push(text);
      // Simulates an engine that eats the sentinel lines.
      return text.replace(/\n⟦\d+⟧\n/g, " ");
    };
    const result = await translateMarkdown(doc, "zh", { translator: hostile });
    expect(result.text).toBe(doc);
    // One batched attempt, then one request per line.
    expect(calls.length).toBeGreaterThan(1);
  });
});

describe("对照 documents", () => {
  const bilingual = [
    "# Guide",
    "",
    "Install the tool first.",
    "",
    "先安装这个工具。",
    "",
    "Then run it.",
    "",
    "然后运行它。",
  ].join("\n");

  it("keeps the hand-written target line and drops its duplicate", async () => {
    let calls = 0;
    const counting: Translator = async (text) => {
      calls += 1;
      return text;
    };
    const result = await translateMarkdown(bilingual, "en", { translator: counting });

    expect(result.bilingual).toBe(true);
    expect(result.stats.dropped).toBe(2);
    expect(calls).toBe(0);
    expect(result.text).toContain("Install the tool first.");
    expect(result.text).toContain("Then run it.");
    expect(result.text).not.toContain("先安装这个工具。");
    expect(result.text).not.toContain("然后运行它。");
  });

  it("drops a stub gloss and translates the full source line instead", async () => {
    const doc = [
      "Compile the production bundle to generate every static asset.",
      "",
      "然后运行构建。",
      "",
      "Publish the generated files to the CDN bucket for distribution.",
      "",
      "然后发布产物。",
    ].join("\n");
    const result = await translateMarkdown(doc, "zh", { translator: identity });

    expect(result.stats.dropped).toBe(2);
    expect(result.text).toContain("Compile the production bundle");
    expect(result.text).not.toContain("然后运行构建。");
  });

  it("does not treat a Chinese article with English terms as 对照", async () => {
    const doc = [
      "# 使用 Markdown 写作",
      "",
      "本文介绍 Read2MD Studio 的基本用法。",
      "",
      "它支持 CodeMirror 编辑器与 Mermaid 图表。",
    ].join("\n");
    const result = await translateMarkdown(doc, "zh", { translator: identity });
    expect(result.bilingual).toBe(false);
    expect(result.text).toBe(doc);
  });
});

describe("failure handling", () => {
  it("keeps the original line and warns when one line fails", async () => {
    const doc = ["Good line one.", "", "BROKEN line two.", "", "Good line three."].join("\n");
    const flaky: Translator = async (text) => {
      if (text.includes("BROKEN")) throw new Error("boom");
      return text;
    };
    const result = await translateMarkdown(doc, "zh", { translator: flaky });

    expect(result.text).toBe(doc);
    expect(result.stats.failed).toBe(1);
    expect(result.warnings.length).toBe(1);
  });

  it("throws when every line fails, so the editor is left untouched", async () => {
    const failing: Translator = async () => {
      throw new Error("network down");
    };
    await expect(translateMarkdown("Hello there.", "zh", { translator: failing })).rejects.toThrow(
      /无响应|network down/,
    );
  });

  it("restores a line whose placeholder the engine deleted", async () => {
    const doc = "Read [the guide](https://example.com/a) before you start.";
    const stripping: Translator = async () => "请先阅读指南。";
    const result = await translateMarkdown(doc, "zh", { translator: stripping });
    expect(result.text).toBe(doc);
  });

  it("surfaces an abort instead of swallowing it", async () => {
    const aborting: Translator = async () => {
      throw new DOMException("aborted", "AbortError");
    };
    await expect(translateMarkdown("Hello there.", "zh", { translator: aborting })).rejects.toSatisfy(
      isAbortError,
    );
  });
});

describe("detectDominantLanguage", () => {
  it("picks the opposite language", () => {
    expect(detectDominantLanguage("这是一段中文。")).toBe("zh");
    expect(detectDominantLanguage("This is English.")).toBe("en");
    expect(detectDominantLanguage("")).toBe("en");
  });

  it("ignores code when a Chinese article is full of English identifiers", () => {
    const doc = [
      "## 核心能力",
      "",
      "本项目使用 TypeScript 与 markdown-it 实现渲染，主题层由 `compileTheme` 编译。",
      "",
      "```ts",
      "const platform: PublishTarget = \"wechat\";",
      "export function describeTarget(target: PublishTarget) {",
      "  return `Copy article HTML for ${target}`;",
      "}",
      "```",
    ].join("\n");
    expect(detectDominantLanguage(doc)).toBe("zh");
  });
});

describe("planDocument", () => {
  it("keeps heading and list markers out of the translated body", () => {
    const plan = planDocument("## Title\n\n- item\n\n1. step", { target: "zh" });
    const texts = plan.segments.filter((segment) => segment.kind === "text");
    expect(texts.map((segment) => segment.kind === "text" && segment.prefix)).toEqual([
      "## ",
      "- ",
      "1. ",
    ]);
  });
});

describe("splitForRequest", () => {
  it("prefers sentence boundaries and never exceeds the limit", () => {
    const text = `${"句子。".repeat(400)}tail`;
    const chunks = splitForRequest(text, 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(120);
    expect(chunks.join("")).toBe(text);
    expect(chunks[0].endsWith("。")).toBe(true);
  });
});
