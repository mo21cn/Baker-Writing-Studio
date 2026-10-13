/**
 * Markdown document translation. The first version only ships a
 * zh <-> en round trip using the public Google Translate free
 * endpoint (https://translate.googleapis.com/translate_a/single).
 * It is intentionally simple:
 *
 *   - The text is split on blank lines into "paragraphs".
 *   - Lines that are pure Markdown syntax (headings, list markers,
 *     blockquote markers, table separators, ...) are kept verbatim.
 *   - Fenced ``` code blocks are copied unchanged.
 *   - Each non-empty translatable paragraph is sent to the API as a
 *     single `q` parameter. Google Translate caps the query length,
 *     so very long paragraphs are further split on sentence
 *     boundaries.
 *   - Network calls are throttled to 4 in flight at a time.
 *
 * The function returns the translated Markdown plus a `warnings`
 * list with anything that could not be translated (API errors, empty
 * responses, ...). On any hard failure the original text is returned
 * unchanged so the editor never loses content.
 */

import i18n from "../../i18n";

export type TranslateTarget = "zh" | "en";

export interface TranslateResult {
  text: string;
  warnings: string[];
}

interface ChunkTask {
  /** Original text slice (already trimmed / prepared). */
  source: string;
  /** Where this slice lives in the joined translated stream. */
  placeholder: string;
}

/**
 * Translate Markdown to the given target language. Preserves fenced
 * code blocks, table separators, list markers, and pure-syntax lines
 * verbatim. Only "prose" paragraphs go through the translation API.
 *
 * "Full text" semantics: when the source document mixes both source-
 * and target-language prose paragraphs (a typical bilingual cheat
 * sheet with `English paragraph / blank / Chinese translation /
 * blank / English paragraph / ...`), the algorithm drops every
 * paragraph that is already in the target language and translates
 * the rest. The result is a single coherent target-language
 * document, not an interleaved "对照" version.
 *
 * When the source is monolingual (pure-EN or pure-ZH) it is
 * translated in place as before.
 */
export async function translateMarkdown(
  markdown: string,
  target: TranslateTarget,
): Promise<TranslateResult> {
  const sourceLang = target === "zh" ? "en" : "zh-CN";
  const targetLang = target === "zh" ? "zh-CN" : "en";

  if (!markdown.trim()) {
    return { text: markdown, warnings: [] };
  }

  const slices = sliceMarkdown(markdown);
  const languages = slices.map(classifySlice);
  const docHasCjk = languages.some((l) => l === "cjk" || l === "mixed");
  const docHasLatin = languages.some((l) => l === "latin" || l === "mixed");
  const isBilingual = docHasCjk && docHasLatin;

  const tasks: ChunkTask[] = [];
  const warnings: string[] = [];
  const dropMask: boolean[] = new Array(slices.length).fill(false);

  // Helper: is the previous non-empty prose slice in the source
  // language (opposite of the current target)? If a target-language
  // paragraph is immediately preceded by a source-language paragraph,
  // we treat it as the redundant "对照" duplicate and drop it.
  const findPrevProse = (idx: number): number => {
    for (let j = idx - 1; j >= 0; j -= 1) {
      if (slices[j].kind === "prose") return j;
    }
    return -1;
  };
  const isSourceProse = (idx: number): boolean => {
    if (idx < 0) return false;
    const text = slices[idx].text;
    if (target === "zh") {
      // Source = English
      return !sliceIsTargetLanguage(text, "zh");
    }
    // Source = Chinese
    return !sliceIsTargetLanguage(text, "en");
  };

  for (let i = 0; i < slices.length; i += 1) {
    const slice = slices[i];
    if (slice.kind !== "prose" || slice.text.trim().length === 0) continue;
    if (
      isBilingual &&
      sliceIsTargetLanguage(slice.text, target) &&
      isSourceProse(findPrevProse(i))
    ) {
      // Drop the target-language paragraph; its source counterpart
      // one slice above will be translated in its place.
      dropMask[i] = true;
      continue;
    }
    tasks.push({
      source: slice.text,
      placeholder: `@@BTRSLC${i}@@`,
    });
  }

  if (tasks.length === 0) {
    return { text: markdown, warnings: [] };
  }

  // 4-way concurrency.
  const concurrency = 4;
  const results = new Array<string | null>(tasks.length).fill(null);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, () =>
    (async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= tasks.length) return;
        const task = tasks[idx];
        try {
          const translated = await translateOne(task.source, sourceLang, targetLang);
          if (translated === null) {
            warnings.push(
              i18n.t("translate.warningChunk", {
                defaultValue: "翻译片段失败：{{text}}",
                text: task.source.slice(0, 40),
              }),
            );
            results[idx] = task.source;
          } else {
            results[idx] = translated;
          }
        } catch (error) {
          warnings.push(
            i18n.t("translate.warningChunk", {
              defaultValue: "翻译片段失败：{{text}}",
              text: task.source.slice(0, 40),
            }) + ` (${(error as Error).message})`,
          );
          results[idx] = task.source;
        }
      }
    })(),
  );
  await Promise.all(workers);

  // Reassemble: substitute placeholders, drop target-language slices,
  // and collapse consecutive blank lines that appear because of drops.
  const placeholders = new Map<string, string>();
  tasks.forEach((task, idx) => {
    placeholders.set(task.placeholder, results[idx] ?? task.source);
  });

  let out = "";
  let lastWasBlank = false;
  for (let i = 0; i < slices.length; i += 1) {
    const slice = slices[i];
    if (slice.kind === "raw") {
      const isBlank = slice.text.trim() === "";
      if (dropMask[i - 1] || (isBlank && lastWasBlank)) {
        // The previous prose slice was dropped (or we already saw a
        // blank), so this blank line is redundant.
        continue;
      }
      out += slice.text;
      lastWasBlank = isBlank;
      continue;
    }
    if (dropMask[i]) {
      lastWasBlank = false;
      continue;
    }
    const text = placeholders.get(`@@BTRSLC${i}@@`) ?? slice.text;
    out += text;
    if (!text.endsWith("\n")) out += "\n";
    lastWasBlank = false;
  }

  return { text: out.replace(/\n+$/, "\n"), warnings };
}

/**
 * Classify a slice's dominant script.
 *   - "cjk"    - has CJK Unified Ideographs, no Latin letters
 *   - "latin"  - has Latin letters, no CJK
 *   - "mixed"  - has both
 *   - "none"   - no script-relevant characters (e.g. syntax only)
 *   - "target-only" - same as the classification above; the special
 *                    marker is used in `dropMask` when the slice
 *                    is purely in the target language inside a
 *                    bilingual document.
 */
function classifySlice(
  slice: Slice,
): "cjk" | "latin" | "mixed" | "none" {
  if (slice.kind !== "prose") return "none";
  const text = slice.text;
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (cjk > 0 && latin > 0) return "mixed";
  if (cjk > 0) return "cjk";
  if (latin > 0) return "latin";
  return "none";
}

function sliceIsTargetLanguage(text: string, target: TranslateTarget): boolean {
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  // A single stray CJK letter is enough to call a slice Chinese for
  // the purposes of "drop the target-language duplicate" when the
  // document is otherwise bilingual. Most cheat-sheet entries mix
  // short Latin tokens (paths, abbreviations like "HO") with CJK
  // prose, so the cjk>0 / latin>0 split is the right call.
  if (target === "zh") return cjk > 0;
  return latin > 0 && cjk === 0;
}

type Slice =
  | { kind: "prose"; text: string }
  | { kind: "raw"; text: string };

/**
 * Split Markdown into "prose" (translatable) and "raw" (verbatim)
 * slices while preserving the original whitespace and structure.
 */
function sliceMarkdown(markdown: string): Slice[] {
  const lines = markdown.split(/\r?\n/);
  const slices: Slice[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flushProse = () => {
    if (buffer.length === 0) return;
    const text = buffer.join("\n");
    if (isPureSyntax(text)) {
      slices.push({ kind: "raw", text });
    } else {
      slices.push({ kind: "prose", text });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      // Code fence boundary: flush prose, then keep the fence as raw.
      flushProse();
      inFence = !inFence;
      slices.push({ kind: "raw", text: line + "\n" });
      continue;
    }
    if (inFence) {
      slices.push({ kind: "raw", text: line + "\n" });
      continue;
    }
    if (line.trim() === "") {
      flushProse();
      slices.push({ kind: "raw", text: line + "\n" });
      continue;
    }
    buffer.push(line);
  }
  flushProse();

  return slices;
}

/**
 * Return true when the slice is pure Markdown syntax (heading markers,
 * bullet / numbered list markers, table separators, etc.) that we
 * should not hand to the translation API.
 */
function isPureSyntax(text: string): boolean {
  const stripped = text.trim();
  if (!stripped) return true;
  if (/^#{1,6}\s*$/.test(stripped)) return true;
  if (/^[-*+]\s*$/.test(stripped)) return true;
  if (/^\d+\.\s*$/.test(stripped)) return true;
  if (/^>\s*$/.test(stripped)) return true;
  // Table separator row like `| --- | --- |`
  if (/^\|?[\s:|-]+\|?$/.test(stripped) && stripped.includes("|")) return true;
  return false;
}

/**
 * Send a single text slice to MyMemory. Returns the translated text
 * or `null` on failure. The MyMemory free endpoint caps the `q`
 * parameter at ~500 characters; longer slices are split on sentence
 * boundaries and re-joined.
 */
async function translateOne(
  text: string,
  source: string,
  target: string,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const pieces = splitForApi(trimmed, 450);
  const out: string[] = [];
  for (const piece of pieces) {
    const translated = await callApi(piece, source, target);
    if (translated === null) return null;
    out.push(translated);
  }
  // Reassemble using the same separators that splitForApi used.
  const reassembled = pieces
    .map((piece, i) => piece + out[i])
    .join("\n");
  // Preserve original trailing/leading whitespace.
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  return leading + reassembled + trailing;
}

/**
 * Split a long string into chunks of at most `maxLen` characters.
 * Splits prefer sentence boundaries (。！？.!?\n) so that the
 * translation API sees coherent text.
 */
function splitForApi(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + maxLen, text.length);
    if (end < text.length) {
      // Walk backwards to find a sentence boundary.
      const slice = text.slice(cursor, end);
      const boundary = findLastBoundary(slice);
      if (boundary > 0) {
        end = cursor + boundary + 1;
      }
    }
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

function findLastBoundary(slice: string): number {
  const re = /[。！？.!?\n]/g;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(slice)) !== null) {
    last = match.index;
  }
  return last;
}

async function callApi(
  text: string,
  source: string,
  target: string,
): Promise<string | null> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source);
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as Array<unknown>;
  // Response shape: [[[translated, original, null, null, score, ...], ...], null, sourceLang, ...]
  const first = data[0];
  if (!Array.isArray(first)) return null;
  const pieces: string[] = [];
  for (const segment of first) {
    if (!Array.isArray(segment) || typeof segment[0] !== "string") continue;
    pieces.push(segment[0]);
  }
  const translated = pieces.join("").trim();
  return translated || null;
}

