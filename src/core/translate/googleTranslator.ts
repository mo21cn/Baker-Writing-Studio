/**
 * Transport for document translation.
 *
 * The public Google endpoint is the only engine available without an
 * API key, so it is wrapped here with the things a UI actually needs:
 * a request cache, bounded retries, long-text splitting, and abort
 * support. Everything above this layer works with plain strings, which
 * keeps the orchestration testable without touching the network.
 */

export type TranslateLocale = "zh-CN" | "en";

export const GOOGLE_ENDPOINT =
  "https://translate.googleapis.com/translate_a/single";

/** The endpoint rejects very long `q` values; keep URLs well under 8 KB. */
const MAX_QUERY_CHARS = 1600;
const MAX_ATTEMPTS = 3;
const CACHE_LIMIT = 800;

const cache = new Map<string, string>();

export interface TranslatorOptions {
  source?: string;
  target: TranslateLocale;
  signal?: AbortSignal;
}

/** Swappable transport, so tests can run without the network. */
export type Translator = (
  text: string,
  options: TranslatorOptions,
) => Promise<string>;

export function abortError(): Error {
  return new DOMException("Translation aborted", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Split on sentence boundaries so each request carries coherent text.
 * Chinese punctuation is included: a document is usually translated
 * *out of* one of the two languages, not always out of English.
 */
export function splitForRequest(text: string, maxChars = MAX_QUERY_CHARS): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const end = Math.min(cursor + maxChars, text.length);
    if (end >= text.length) {
      chunks.push(text.slice(cursor));
      break;
    }
    const window = text.slice(cursor, end);
    const boundary = Math.max(
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
      window.lastIndexOf("."),
      window.lastIndexOf("!"),
      window.lastIndexOf("?"),
      window.lastIndexOf("\n"),
    );
    // A boundary too close to the start would make no progress worth
    // having; cut at the window edge instead.
    const cut = boundary > maxChars * 0.3 ? cursor + boundary + 1 : end;
    chunks.push(text.slice(cursor, cut));
    cursor = cut;
  }
  return chunks;
}

function readTranslated(data: unknown): string | null {
  if (!Array.isArray(data)) return null;
  const segments = data[0];
  if (!Array.isArray(segments)) return null;
  const pieces: string[] = [];
  for (const segment of segments) {
    if (!Array.isArray(segment)) continue;
    const [translated] = segment as unknown[];
    if (typeof translated === "string") pieces.push(translated);
  }
  const joined = pieces.join("").trim();
  return joined.length > 0 ? joined : null;
}

/**
 * One HTTP round trip, with retries for the two failure modes that are
 * actually transient: rate limiting and network blips. A 4xx response
 * other than 429 is a bug in the request and is surfaced immediately.
 */
async function requestOnce(
  text: string,
  options: TranslatorOptions,
): Promise<string> {
  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", options.source ?? "auto");
  url.searchParams.set("tl", options.target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: options.signal,
      });
      if (response.ok) {
        const parsed = readTranslated(await response.json());
        if (parsed === null) throw new Error("Empty translation response");
        return parsed;
      }
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) {
        throw new Error(`Translation request failed (HTTP ${response.status})`);
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (attempt === MAX_ATTEMPTS) throw error;
    }
    await sleep(350 * 2 ** (attempt - 1) + Math.random() * 150, options.signal);
  }
  throw new Error("Translation request failed");
}

/** Live translator backed by the public endpoint. */
export const googleTranslator: Translator = async (text, options) => {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const key = `${options.target}\u0000${options.source ?? "auto"}\u0000${trimmed}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const pieces = splitForRequest(trimmed);
  const translated: string[] = [];
  for (const piece of pieces) {
    translated.push(await requestOnce(piece, options));
  }
  const result = translated.join(" ");

  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return result;
};

/** Test hook: drop memoised translations. */
export function clearTranslationCache(): void {
  cache.clear();
}
