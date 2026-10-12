/**
 * Markdown document translation. The first version only ships a
 * zh <-> en round trip using the public MyMemory translation API
 * (https://api.mymemory.translated.net). It is intentionally simple:
 *
 *   - The text is split on blank lines into "paragraphs".
 *   - Lines that are pure Markdown syntax (headings, list markers,
 *     blockquote markers, table separators, ...) are kept verbatim.
 *   - Fenced ``` code blocks are copied unchanged.
 *   - Each non-empty translatable paragraph is sent to the API as a
 *     single `q` parameter. MyMemory caps the query length, so very
 *     long paragraphs are further split on sentence boundaries.
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
  const tasks: ChunkTask[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < slices.length; i += 1) {
    const slice = slices[i];
    if (slice.kind === "prose" && slice.text.trim().length > 0) {
      tasks.push({
        source: slice.text,
        placeholder: `@@BTRSLC${i}@@`,
      });
    }
  }

  if (tasks.length === 0) {
    return { text: markdown, warnings: [] };
  }

  // 4-way concurrency. MyMemory's free tier is rate-limited but the
  // limit is generous for short bursts.
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

  // Reassemble: substitute placeholders back into the slice stream.
  const placeholders = new Map<string, string>();
  tasks.forEach((task, idx) => {
    placeholders.set(task.placeholder, results[idx] ?? task.source);
  });

  let out = "";
  for (let i = 0; i < slices.length; i += 1) {
    const slice = slices[i];
    if (slice.kind === "prose") {
      out += placeholders.get(`@@BTRSLC${i}@@`) ?? slice.text;
    } else {
      out += slice.text;
    }
  }

  return { text: out, warnings };
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
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `${source}|${target}`);
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
  };
  const translated = data.responseData?.translatedText?.trim();
  if (!translated) return null;
  return unescapeHtml(translated);
}

/**
 * MyMemory returns HTML-escaped translations. The pieces we care
 * about (`&amp;` etc.) are common enough to unescape so the
 * resulting Markdown stays readable.
 */
function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}