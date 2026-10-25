/**
 * Whole-document translation.
 *
 * Pipeline:
 *
 *   Markdown
 *     → planDocument()      split into raw / translatable lines, protect
 *                           inline constructs, mark redundant 对照 lines
 *     → batching            pack short lines into one request, separated by
 *                           numeric sentinels the engine leaves alone
 *     → googleTranslator()  4-way concurrency, retries, cache
 *     → reassemble          stitch markers back, restore placeholders
 *
 * Failure policy: a line that cannot be translated keeps its original
 * text, and a document that fails *entirely* throws so the caller can
 * leave the editor untouched. Translation never silently loses content.
 */

import i18n from "../../i18n";
import {
  planDocument,
  restoreInline,
  type Segment,
  type TranslateTarget,
} from "./markdownSegments";
import {
  googleTranslator,
  isAbortError,
  type Translator,
} from "./googleTranslator";

export type { TranslateTarget };

export interface TranslateProgress {
  done: number;
  total: number;
}

export interface TranslateStats {
  /** Lines that needed the engine. */
  total: number;
  translated: number;
  failed: number;
  /** Lines dropped as redundant 对照 duplicates. */
  dropped: number;
}

export interface TranslateResult {
  text: string;
  warnings: string[];
  stats: TranslateStats;
  bilingual: boolean;
}

export interface TranslateOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TranslateProgress) => void;
  /** Test seam; production uses the public endpoint. */
  translator?: Translator;
}

/** Sentinels are numeric on purpose: the engine translates words. */
const SEPARATOR_BASE = 900000;
const BATCH_CHARS = 1100;
const BATCH_UNITS = 12;
const CONCURRENCY = 4;

/**
 * Guess the language a document is written in, so the button can name
 * the language the click would produce.
 *
 * Code is stripped first: a Chinese technical article full of
 * `TypeScript`, `Rust / WASM` and inline code otherwise reads as Latin.
 * After that, a CJK glyph carries roughly a word (about 4.5 Latin
 * letters), so CJK wins whenever it is more than half the Latin count.
 * Ties read as English, matching the Chinese-only UI.
 */
export function detectDominantLanguage(markdown: string): TranslateTarget {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ");
  const cjk = (prose.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (prose.match(/[A-Za-z]/g) || []).length;
  return cjk * 2 > latin ? "zh" : "en";
}

interface Batch {
  segments: number[];
  separatorIds: number[];
  payload: string;
}

function buildBatches(
  segments: ReadonlyArray<Segment>,
  indices: readonly number[],
): Batch[] {
  const batches: Batch[] = [];
  let current: Batch = { segments: [], separatorIds: [], payload: "" };

  const flush = () => {
    if (current.segments.length > 0) batches.push(current);
    current = { segments: [], separatorIds: [], payload: "" };
  };

  for (const index of indices) {
    const segment = segments[index];
    if (segment.kind !== "text") continue;
    const text = segment.body;

    if (current.segments.length > 0) {
      const separator =
        SEPARATOR_BASE + batches.length * BATCH_UNITS + current.segments.length;
      const glued = `${current.payload}\n⟦${separator}⟧\n${text}`;
      if (glued.length > BATCH_CHARS || current.segments.length >= BATCH_UNITS) {
        flush();
      } else {
        current.separatorIds.push(separator);
        current.segments.push(index);
        current.payload = glued;
        continue;
      }
    }

    current.segments = [index];
    current.separatorIds = [];
    current.payload = text;
  }
  flush();
  return batches;
}

function splitBatchResult(result: string, batch: Batch): string[] | null {
  if (batch.segments.length === 1) return [result];
  const ids = [...batch.separatorIds].sort((a, b) => b - a);
  const pattern = new RegExp(`\\s*⟦\\s*(?:${ids.join("|")})\\s*⟧\\s*`, "g");
  const parts = result.split(pattern);
  return parts.length === batch.segments.length ? parts : null;
}

/**
 * Translate a Markdown document in place. Pure with respect to its
 * input: the caller decides whether to replace the editor content.
 */
export async function translateMarkdown(
  markdown: string,
  target: TranslateTarget,
  options: TranslateOptions = {},
): Promise<TranslateResult> {
  if (!markdown.trim()) {
    return {
      text: markdown,
      warnings: [],
      stats: { total: 0, translated: 0, failed: 0, dropped: 0 },
      bilingual: false,
    };
  }

  const translator = options.translator ?? googleTranslator;
  const plan = planDocument(markdown, { target });
  const dropped = plan.segments.filter(
    (segment) => segment.kind === "text" && segment.drop,
  ).length;
  const total = plan.jobs.length;

  if (total === 0) {
    // Nothing to send, but a 对照 document may still need its duplicate
    // source lines removed.
    return {
      text: dropped > 0 ? reassemble(plan.segments, new Map(), true, markdown) : markdown,
      warnings: [],
      stats: { total: 0, translated: 0, failed: 0, dropped },
      bilingual: plan.bilingual,
    };
  }

  const locale = target === "zh" ? "zh-CN" : "en";
  const translated = new Map<number, string>();
  const failures: number[] = [];
  let done = 0;

  const reportProgress = () => {
    options.onProgress?.({ done, total });
  };
  reportProgress();

  const translateOne = async (index: number): Promise<void> => {
    const segment = plan.segments[index];
    if (segment.kind !== "text") return;
    try {
      const single = await translator(segment.body, {
        target: locale,
        signal: options.signal,
      });
      if (single.trim()) translated.set(index, single.trim());
      else failures.push(index);
    } catch (error) {
      if (isAbortError(error)) throw error;
      failures.push(index);
    }
    done += 1;
    reportProgress();
  };

  const runBatch = async (batch: Batch): Promise<void> => {
    try {
      const result = await translator(batch.payload, {
        target: locale,
        signal: options.signal,
      });
      const parts = splitBatchResult(result, batch);
      if (parts !== null) {
        batch.segments.forEach((index, position) => {
          const value = parts[position]?.trim() ?? "";
          if (value) translated.set(index, value);
          else failures.push(index);
          done += 1;
        });
        reportProgress();
        return;
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
    }

    // Either the engine reflowed the separators or the request failed:
    // fall back to one line per request so a single bad line cannot
    // take the whole document down with it.
    for (const index of batch.segments) {
      if (translated.has(index)) continue;
      await translateOne(index);
    }
  };

  const batches = buildBatches(plan.segments, plan.jobs);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= batches.length) return;
      if (options.signal?.aborted) throw new DOMException("Translation aborted", "AbortError");
      await runBatch(batches[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker),
  );

  const stats: TranslateStats = {
    total,
    translated: translated.size,
    failed: failures.length,
    dropped,
  };
  if (stats.translated === 0) {
    throw new Error(
      i18n.t("translate.noResponse", {
        defaultValue: "翻译服务无响应，文档未改动",
      }),
    );
  }

  const warnings: string[] = [];
  if (failures.length > 0) {
    warnings.push(
      i18n.t("translate.partialFailure", {
        count: failures.length,
        defaultValue: "{{count}} 行未能翻译，已保留原文",
      }),
    );
  }

  return {
    text: reassemble(plan.segments, translated, dropped > 0, markdown),
    warnings,
    stats,
    bilingual: plan.bilingual,
  };
}

function countPlaceholders(body: string): number {
  const ids = new Set<string>();
  const pattern = /⟦\s*(\d+)\s*⟧/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) ids.add(match[1]);
  return ids.size;
}

function reassemble(
  segments: ReadonlyArray<Segment>,
  translated: ReadonlyMap<number, string>,
  collapseBlanks: boolean,
  original: string,
): string {
  const lines: string[] = [];

  segments.forEach((segment, index) => {
    if (segment.kind === "raw") {
      lines.push(segment.raw);
      return;
    }
    if (segment.drop) return;

    const body = translated.get(index);
    if (body === undefined) {
      lines.push(segment.raw);
      return;
    }
    // A placeholder the engine dropped or renumbered would silently
    // delete a link or a formula; fall back to the untranslated line.
    if (countPlaceholders(body) !== segment.spans.length) {
      lines.push(segment.raw);
      return;
    }
    const restored = restoreInline(body, segment.spans);
    if (!restored) {
      lines.push(segment.raw);
      return;
    }
    lines.push(`${segment.prefix}${restored}`);
  });

  let text = lines.join("\n");
  if (collapseBlanks) {
    // Dropping 对照 duplicates leaves the blank line that separated the
    // pair behind; collapse the runs it creates, never more than that.
    text = text.replace(/\n{3,}/g, "\n\n");
  }
  if (original.includes("\r\n")) text = text.replace(/\n/g, "\r\n");
  return text;
}

export { isAbortError };
