/**
 * Markdown segmentation for document translation.
 *
 * The translation engine (an online MT API) only understands plain
 * text. Handing it raw Markdown is what broke earlier attempts: fenced
 * code was translated (`const` -> `常量`), table separator rows were
 * rewritten, and inline code / links / formulas came back mangled.
 *
 * This module splits a document into:
 *
 *   - `raw` segments: lines that must never reach the engine (front
 *     matter, fenced code, block math, HTML blocks, table separators,
 *     horizontal rules, link reference definitions, indented code).
 *   - `text` segments: a translatable body plus the Markdown marker
 *     that precedes it (`# `, `- `, `> `, `1. `, ...). Only the body
 *     is sent; the marker is stitched back afterwards, so list and
 *     heading syntax can never be altered by the engine.
 *
 * Inline constructs inside a body (code spans, inline math, link and
 * image destinations, bare URLs, HTML tags) are replaced by numeric
 * placeholders `⟦n⟧`. The public endpoint leaves those untouched --
 * verified against the live API -- while it happily rewrites anything
 * that looks like prose. Placeholders are restored after translation.
 */

export type TranslateTarget = "zh" | "en";

export type LineLanguage = "zh" | "en" | "mixed" | "neutral";

export interface TextSegment {
  kind: "text";
  /** Original line, used verbatim when translation fails. */
  raw: string;
  /** Leading Markdown marker (`# `, `- `, `> `, `12. `), verbatim. */
  prefix: string;
  /** Body after the marker, with inline constructs replaced by ⟦n⟧. */
  body: string;
  /** Original inline constructs, keyed by placeholder id. */
  spans: Array<{ id: number; text: string }>;
  /** Dominant script of the body. */
  language: LineLanguage;
  /** Set when the line duplicates the source-language line above it. */
  drop: boolean;
}

export interface RawSegment {
  kind: "raw";
  raw: string;
}

export type Segment = TextSegment | RawSegment;

export interface DocumentPlan {
  segments: Segment[];
  /** Placeholder bodies that still need translating, by segment index. */
  jobs: number[];
  /** True when the document alternates source and translated prose. */
  bilingual: boolean;
  /** Placeholder id -> original inline text, for the whole document. */
  spanById: Map<number, string>;
}

const CJK_RE = /[\u4e00-\u9fff]/g;
const LATIN_RE = /[A-Za-z]/g;

export function countCjk(text: string): number {
  return (text.match(CJK_RE) || []).length;
}

export function countLatin(text: string): number {
  return (text.match(LATIN_RE) || []).length;
}

/**
 * Classify a prose line by script. Chinese technical prose carries a
 * lot of Latin tokens (product names, versions, paths), so CJK wins at
 * a 2:1 disadvantage; English only picks up incidental CJK, so Latin
 * must dominate outright.
 */
export function classifyLine(text: string): LineLanguage {
  const cjk = countCjk(text);
  const latin = countLatin(text);
  if (cjk === 0 && latin === 0) return "neutral";
  if (cjk > 0 && latin > 0) {
    if (cjk * 2 >= latin) return "zh";
    if (latin * 3 >= cjk) return "en";
    return "mixed";
  }
  return cjk > 0 ? "zh" : "en";
}

/**
 * Whether a body still needs the engine.
 *
 * A line is skipped only when it is already dominated by the target
 * language. "Markdown 编辑" is mixed, not English: skipping every line
 * with more Latin letters than CJK left list items untranslated in the
 * first end-to-end run.
 */
export function needsTranslation(
  body: string,
  target: TranslateTarget,
): boolean {
  const cjk = countCjk(body);
  const latin = countLatin(body);
  if (cjk === 0 && latin === 0) return false;
  if (target === "en") return cjk > 0;
  return cjk * 2 < latin;
}

/** The language a line is *not*, i.e. what it needs to become. */
function opposite(target: TranslateTarget): TranslateTarget {
  return target === "zh" ? "en" : "zh";
}

// ---------------------------------------------------------------------------
// Inline protection
// ---------------------------------------------------------------------------

const CODE_START = /`+/y;
const MATH_DISPLAY = /\$\$[^$\n]{0,400}\$\$/y;
const MATH_INLINE = /\$(?![\s$])[^$\n]{0,200}?(?<![\s$])\$(?![\w$])/y;
const LINK_DEST = /\]\((?:[^()\n]|\([^()\n]*\))*\)/y;
const REF_LINK = /\]\[[^\]\n]*\]/y;
const URL_RE = /https?:\/\/[^\s<>)\]]+/y;
const HTML_TAG = /<\/?[a-zA-Z][^>\n]*>/y;

function stickyMatch(re: RegExp, text: string, at: number): string | null {
  re.lastIndex = at;
  const match = re.exec(text);
  return match ? match[0] : null;
}

/**
 * `$5 and $6` is money, not TeX. Only protect dollar spans that carry
 * math syntax or are a single token.
 */
function looksLikeMath(inner: string): boolean {
  if (/[\\^_{}]/.test(inner)) return true;
  return !/\s/.test(inner) && /[A-Za-z0-9]/.test(inner);
}

/**
 * Split `text` into a placeholder-bearing body plus the original
 * constructs. `allocate` hands out document-unique ids so restoration
 * can happen once, at the end.
 */
export function protectInline(
  text: string,
  allocate: () => number,
): { body: string; spans: Array<{ id: number; text: string }> } {
  const spans: Array<{ id: number; text: string }> = [];
  let body = "";
  let i = 0;

  const push = (literal: string) => {
    const id = allocate();
    spans.push({ id, text: literal });
    body += `⟦${id}⟧`;
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === "`") {
      const run = stickyMatch(CODE_START, text, i);
      if (run) {
        const close = text.indexOf(run, i + run.length);
        if (close !== -1) {
          push(text.slice(i, close + run.length));
          i = close + run.length;
          continue;
        }
      }
    }

    if (ch === "$") {
      const display = stickyMatch(MATH_DISPLAY, text, i);
      if (display) {
        push(display);
        i += display.length;
        continue;
      }
      const inline = stickyMatch(MATH_INLINE, text, i);
      if (inline) {
        const inner = inline.slice(1, -1);
        if (looksLikeMath(inner)) {
          push(inline);
          i += inline.length;
          continue;
        }
      }
    }

    if (ch === "]" ) {
      const dest = stickyMatch(LINK_DEST, text, i);
      if (dest) {
        push(dest);
        i += dest.length;
        continue;
      }
      const ref = stickyMatch(REF_LINK, text, i);
      if (ref) {
        push(ref);
        i += ref.length;
        continue;
      }
    }

    if (ch === "h" && text.startsWith("http", i)) {
      const url = stickyMatch(URL_RE, text, i);
      if (url) {
        push(url);
        i += url.length;
        continue;
      }
    }

    if (ch === "<") {
      const tag = stickyMatch(HTML_TAG, text, i);
      if (tag) {
        push(tag);
        i += tag.length;
        continue;
      }
    }

    body += ch;
    i += 1;
  }

  return { body, spans };
}

/** Put the original inline constructs back. */
export function restoreInline(
  body: string,
  spans: ReadonlyArray<{ id: number; text: string }>,
): string {
  if (spans.length === 0) return body;
  const byId = new Map(spans.map((span) => [span.id, span.text]));
  const restored = body.replace(/⟦\s*(\d+)\s*⟧/g, (whole, digits: string) => {
    const id = Number(digits);
    return byId.get(id) ?? whole;
  });
  // A placeholder the engine dropped entirely would silently delete a
  // link or a formula; fall back to the untranslated line instead.
  if (restored.includes("⟦")) return "";
  return restored;
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const BLOCK_MATH_OPEN = /^ {0,3}\$\$/;
const FRONT_MATTER = /^---\s*$/;
const TABLE_SEPARATOR = /^ {0,3}\|?[\s:|-]+\|[\s:|-]*$/;
const RULE = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const LINK_DEF = /^ {0,3}\[[^\]\n]+\]:\s+\S/;
const INDENTED_CODE = /^(?: {4,}|\t)\S/;
const HTML_BLOCK = /^ {0,3}<(script|style|pre|iframe|table|!--)/i;
const PREFIX = /^ {0,3}(#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d{1,9}[.)]\s+)/;

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function splitPrefix(line: string): { prefix: string; body: string } {
  const match = PREFIX.exec(line);
  if (!match) return { prefix: "", body: line };
  return { prefix: match[0], body: line.slice(match[0].length) };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export interface PlanOptions {
  target: TranslateTarget;
}

/**
 * Turn a document into segments. Pure and deterministic: the same
 * input always yields the same plan, which is what makes the mapping
 * back to Markdown trustworthy.
 */
export function planDocument(markdown: string, options: PlanOptions): DocumentPlan {
  const lines = markdown.split(/\r?\n/);
  const spanById = new Map<number, string>();
  let nextId = 0;
  const allocate = () => {
    const id = nextId;
    nextId += 1;
    return id;
  };

  const segments: Segment[] = [];
  let inFence = false;
  let inBlockMath = false;
  let inHtmlBlock = false;
  let previousWasBlank = true;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    // Front matter only counts on the very first line.
    if (index === 0 && FRONT_MATTER.test(line)) {
      let end = lines.length - 1;
      for (let scan = 1; scan < lines.length; scan += 1) {
        if (FRONT_MATTER.test(lines[scan])) {
          end = scan;
          break;
        }
      }
      for (let scan = 0; scan <= end; scan += 1) {
        segments.push({ kind: "raw", raw: lines[scan] });
      }
      index = end;
      continue;
    }

    if (inFence) {
      segments.push({ kind: "raw", raw: line });
      if (FENCE_CLOSE.test(line)) inFence = false;
      continue;
    }

    if (FENCE.test(line)) {
      inFence = true;
      segments.push({ kind: "raw", raw: line });
      previousWasBlank = false;
      continue;
    }

    if (inBlockMath) {
      segments.push({ kind: "raw", raw: line });
      if (line.includes("$$")) inBlockMath = false;
      continue;
    }

    if (BLOCK_MATH_OPEN.test(line)) {
      segments.push({ kind: "raw", raw: line });
      // `$$x$$` on one line is self-contained; anything else opens a
      // block that runs until the next `$$`.
      const rest = line.replace(/^ {0,3}\$\$/, "");
      if (!rest.includes("$$")) inBlockMath = true;
      continue;
    }

    if (inHtmlBlock) {
      segments.push({ kind: "raw", raw: line });
      if (isBlank(line)) inHtmlBlock = false;
      continue;
    }

    if (HTML_BLOCK.test(line)) {
      inHtmlBlock = true;
      segments.push({ kind: "raw", raw: line });
      continue;
    }

    // CommonMark only treats a 4-space indent as code when it follows a
    // blank line; without that guard nested list content is skipped.
    const indentedCode = previousWasBlank && INDENTED_CODE.test(line);

    if (
      isBlank(line) ||
      RULE.test(line) ||
      LINK_DEF.test(line) ||
      TABLE_SEPARATOR.test(line) ||
      indentedCode
    ) {
      segments.push({ kind: "raw", raw: line });
      previousWasBlank = isBlank(line);
      continue;
    }

    previousWasBlank = false;
    const { prefix, body } = splitPrefix(line);
    const protectedBody = protectInline(body, allocate);
    for (const span of protectedBody.spans) spanById.set(span.id, span.text);

    segments.push({
      kind: "text",
      raw: line,
      prefix,
      body: protectedBody.body,
      spans: protectedBody.spans,
      language: classifyLine(body),
      drop: false,
    });
  }

  const prose = segments.filter(
    (segment): segment is TextSegment =>
      segment.kind === "text" && segment.body.trim().length > 0,
  );
  const bilingual = isBilingual(prose);
  if (bilingual) markDuplicateTranslations(prose, options.target);

  const jobs: number[] = [];
  segments.forEach((segment, index) => {
    if (segment.kind !== "text" || segment.drop) return;
    if (!needsTranslation(segment.body, options.target)) return;
    jobs.push(index);
  });

  return { segments, jobs, bilingual, spanById };
}

/**
 * A genuine bilingual "对照" sheet alternates languages line by line:
 * English heading, Chinese heading, English bullet, Chinese bullet...
 * Merely containing both scripts is not enough -- a Chinese article
 * that mentions "Markdown" also does, and dropping its Chinese lines
 * would gut the document.
 */
export function isBilingual(prose: ReadonlyArray<TextSegment>): boolean {
  if (prose.length < 4) return false;
  const zh = prose.filter((line) => line.language === "zh").length;
  const en = prose.filter((line) => line.language === "en").length;
  if (zh < 1 || en < 1) return false;
  const minority = Math.min(zh, en);
  if (minority / prose.length < 0.25) return false;
  if (alternations(prose) / Math.max(1, prose.length - 1) < 0.5) return false;
  return true;
}

function alternations(prose: ReadonlyArray<TextSegment>): number {
  let count = 0;
  for (let i = 0; i + 1 < prose.length; i += 1) {
    const a = prose[i];
    const b = prose[i + 1];
    if (a.prefix !== b.prefix) continue;
    const aLang = a.language;
    const bLang = b.language;
    if (aLang === "zh" && bLang === "en") count += 1;
    else if (aLang === "en" && bLang === "zh") count += 1;
  }
  return count;
}

/**
 * Reconcile a 对照 pair: one line is in the target language, the other
 * states the same thing in the source language.
 *
 * Two cases, because a "translation" can be a full equivalent or just
 * a short gloss:
 *
 *   - comparable weight (within 2.2x): the hand-written target line is
 *     at least as good as machine output, so keep it verbatim and drop
 *     the source line. No request is made.
 *   - much shorter target line: it is a stub ("然后运行构建。" next to a
 *     full English sentence). Keeping it would lose detail, so the stub
 *     is dropped and the full source line is translated instead.
 */
function markDuplicateTranslations(
  prose: TextSegment[],
  target: TranslateTarget,
): void {
  const sourceLang = opposite(target);
  for (let i = 0; i + 1 < prose.length; i += 1) {
    const first = prose[i];
    const second = prose[i + 1];
    if (first.drop || second.drop) continue;
    if (first.prefix !== second.prefix) continue;
    if (first.language === target && second.language === sourceLang) {
      reconcilePair(second, first);
    } else if (first.language === sourceLang && second.language === target) {
      reconcilePair(first, second);
    }
  }
}

function reconcilePair(source: TextSegment, targetLine: TextSegment): void {
  const sourceWeight = weightOf(source);
  const targetWeight = weightOf(targetLine);
  if (targetWeight * 2.2 >= sourceWeight) {
    // Equivalent translation: keeping the native line avoids rewriting
    // text the author already wrote -- but only if it carries every
    // inline construct of the line it replaces.
    if (carriesSpanMissingFrom(source, targetLine)) return;
    source.drop = true;
    return;
  }
  targetLine.drop = true;
}

/** Rough information weight: a CJK glyph carries about two Latin letters. */
function weightOf(segment: TextSegment): number {
  const text = segment.spans.reduce(
    (accumulated, span) => accumulated + span.text,
    segment.body,
  );
  return countCjk(text) * 2 + countLatin(text);
}

function carriesSpanMissingFrom(
  candidate: TextSegment,
  keep: TextSegment,
): boolean {
  if (candidate.spans.length === 0) return false;
  const keepText = keep.spans.map((span) => span.text).join("\u0000");
  return candidate.spans.some((span) => !keepText.includes(span.text));
}
