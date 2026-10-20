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
 * Detect whether a document reads as Chinese or English, so callers can
 * pick the opposite language as the translation target without a UI
 * picker. Counts CJK Unified Ideographs against Latin letters across the
 * whole document (code fences included -- they are short enough not to
 * skew the result). Ties default to "en" so an empty / symbol-only
 * document is translated *into* Chinese, which matches the Chinese-only
 * UI.
 */
export function detectDominantLanguage(markdown: string): "zh" | "en" {
  const cjk = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (markdown.match(/[A-Za-z]/g) || []).length;
  return cjk > latin ? "zh" : "en";
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

  const plan = planLines(markdown, target);

  // Translate only the prose lines. Verbatim lines (code fences, table
  // rows, pure syntax, blank lines) pass through untouched, and "drop"
  // lines are the redundant target-language duplicates of the source
  // line above them.
  const jobs: Array<{ index: number; text: string }> = [];
  const warnings: string[] = [];
  for (let i = 0; i < plan.length; i += 1) {
    const entry = plan[i];
    if (entry.action !== "prose") continue;
    if (entry.text.trim().length === 0) continue;
    jobs.push({ index: i, text: entry.text });
  }

  if (jobs.length === 0) {
    return { text: markdown, warnings: [] };
  }

  // 4-way concurrency keeps the round trips quick without tripping the
  // provider's rate limit.
  const concurrency = 4;
  const translatedByIndex = new Map<number, string>();
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, () =>
    (async () => {
      while (true) {
        const jobIdx = cursor;
        cursor += 1;
        if (jobIdx >= jobs.length) return;
        const job = jobs[jobIdx];
        try {
          const translated = await translateOne(job.text, sourceLang, targetLang);
          translatedByIndex.set(
            job.index,
            translated === null
              ? job.text
              : translated,
          );
          if (translated === null) {
            warnings.push(
              i18n.t("translate.warningChunk", {
                defaultValue: "翻译片段失败：{{text}}",
                text: job.text.slice(0, 40),
              }),
            );
          }
        } catch (error) {
          translatedByIndex.set(job.index, job.text);
          warnings.push(
            i18n.t("translate.warningChunk", {
              defaultValue: "翻译片段失败：{{text}}",
              text: job.text.slice(0, 40),
            }) + ` (${(error as Error).message})`,
          );
        }
      }
    })(),
  );
  await Promise.all(workers);

  // Reassemble, collapsing the blank-line runs that dropping the "对照"
  // duplicates leaves behind.
  const outLines: string[] = [];
  let pendingBlank = false;
  for (let i = 0; i < plan.length; i += 1) {
    const entry = plan[i];
    if (entry.action === "drop") continue;
    const text =
      entry.action === "prose" ? translatedByIndex.get(i) ?? entry.text : entry.text;

    if (text.trim() === "") {
      pendingBlank = outLines.length > 0;
      continue;
    }
    if (pendingBlank) {
      outLines.push("");
      pendingBlank = false;
    }
    outLines.push(text);
  }

  return { text: outLines.join("\n") + "\n", warnings };
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

// ---------------------------------------------------------------------------
// Line-level bilingual handling
// ---------------------------------------------------------------------------

/**
 * Split the document into lines tagged with the decision made for each:
 *   - "drop"     : a target-language line that duplicates the source line
 *                  immediately above it (the "对照" translation).
 *   - "verbatim" : code fences, code bodies, table rows, pure syntax.
 *   - "prose"    : everything else; sent to the translation API.
 */
function planLines(
  markdown: string,
  target: TranslateTarget,
): Array<{ action: "drop" | "verbatim" | "prose"; text: string }> {
  const lines = markdown.split(/\r?\n/);
  const plan: Array<{ action: "drop" | "verbatim" | "prose"; text: string }> = [];
  let inFence = false;
  let lastKeptWasSourceProse = false;

  // Decide whether this is a genuine bilingual "对照" sheet before
  // dropping anything. Merely finding both scripts is not enough: an
  // ordinary Chinese article that merely mentions "Markdown" or "Read2MD
  // Studio" also has both, and dropping its Chinese lines would empty
  // the document. What distinguishes a cheat sheet is ALTERNATION --
  // consecutive prose lines flipping between the two languages, either
  // EN followed by ZH or ZH followed by EN.
  const proseLines: string[] = [];
  let fence = false;
  for (const raw of markdown.split(/\r?\n/)) {
    if (raw.trimStart().startsWith("```")) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (raw.trim() === "") continue;
    if (isPureSyntax(raw)) continue;
    proseLines.push(raw);
  }

  let alternatingPairs = 0;
  for (let i = 0; i + 1 < proseLines.length; i += 1) {
    const a = proseLines[i];
    const b = proseLines[i + 1];
    if (leadingMarker(a) !== leadingMarker(b)) continue;
    const zhThenEn = lineIsTargetLanguage(a, "zh") && lineIsTargetLanguage(b, "en");
    const enThenZh = lineIsTargetLanguage(a, "en") && lineIsTargetLanguage(b, "zh");
    if (zhThenEn || enThenZh) alternatingPairs += 1;
  }

  // One adjacent pair is enough to confirm the pattern: the user is
  // looking at a real bilingual sheet, and every target-language line in
  // it is a redundant pre-existing translation.
  const bilingual = alternatingPairs >= 1;

  for (const line of lines) {
    const isFence = line.trimStart().startsWith("```");
    if (isFence) {
      inFence = !inFence;
      plan.push({ action: "verbatim", text: line });
      lastKeptWasSourceProse = false;
      continue;
    }
    if (inFence) {
      plan.push({ action: "verbatim", text: line });
      continue;
    }
    if (line.trim() === "") {
      plan.push({ action: "verbatim", text: line });
      lastKeptWasSourceProse = false;
      continue;
    }
    // Blank-line and code-fence resets above also clear the "previous
    // line was source" memory; the document-level `bilingual` flag
    // survives them, which is the point.
    if (isPureSyntax(line)) {
      plan.push({ action: "verbatim", text: line });
      lastKeptWasSourceProse = false;
      continue;
    }

    // A non-empty prose line.
    if (
      (bilingual || lastKeptWasSourceProse) &&
      lineIsTargetLanguage(line, target)
    ) {
      plan.push({ action: "drop", text: line });
      continue;
    }

    const isSource = lineIsSourceLanguage(line, target);
    plan.push({ action: "prose", text: line });
    lastKeptWasSourceProse = isSource;
  }

  return plan;
}

/**
 * A line counts as "in the target language" when it is predominantly
 * that language.
 *
 * The tolerances are deliberately asymmetric. Chinese technical prose is
 * saturated with latin tokens -- product names ("BCE-1", "Smoke"),
 * version strings ("v0.1"), paths, abbreviations ("HO"), inline code --
 * so a Chinese line may legitimately carry twice as many latin letters as
 * CJK characters and still be Chinese. English prose, by contrast, only
 * ever picks up incidental CJK, so latin must dominate it outright.
 *
 * Getting this wrong is what previously let the "对照" duplicates
 * through: a Chinese line whose latin count matched its CJK count was
 * classified as source on one test and target on the other, so the
 * drop never fired.
 */
function lineIsTargetLanguage(line: string, target: TranslateTarget): boolean {
  const cjk = countCjk(line);
  const latin = countLatin(line);
  if (cjk === 0 && latin === 0) return false;
  if (target === "zh") return cjk > 0 && cjk * 2 >= latin;
  return latin > 0 && latin * 3 >= cjk;
}

/**
 * The leading Markdown structure of a line: heading hashes, blockquote
 * markers, bullet / ordered-list prefixes, and the "bold label" pattern
 * that bilingual cheat sheets use for field names ("**Inputs:**").
 *
 * Two lines that state the same fact in two languages share this
 * prefix; two unrelated paragraphs do not. Returns "" for a plain
 * paragraph, which pairs with any other plain paragraph.
 */
function leadingMarker(line: string): string {
  const heading = /^(#{1,6})\s+/.exec(line);
  if (heading) return heading[1];

  const quote = /^((?:>\s*)+)/.exec(line);
  if (quote) return quote[1];

  const bullet = /^(\s*)([-*+])\s+/.exec(line);
  if (bullet) return `${bullet[1]}${bullet[2]}`;

  const ordered = /^(\s*\d+)[.)]\s+/.exec(line);
  if (ordered) return ordered[1];

  const label = /^\s*(\*\*[^*]+\*\*)/.exec(line);
  if (label) return label[1];

  return "";
}

/**
 * Exact negation of lineIsTargetLanguage(). Kept as a named helper so the
 * drop rule reads clearly, and so the two predicates can never drift into
 * contradicting each other.
 */
function lineIsSourceLanguage(line: string, target: TranslateTarget): boolean {
  return !lineIsTargetLanguage(line, target);
}

function countCjk(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

function countLatin(text: string): number {
  return (text.match(/[A-Za-z]/g) || []).length;
}

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

