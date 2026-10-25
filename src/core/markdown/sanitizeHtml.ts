/**
 * Sanitize rendered Markdown before it reaches the preview DOM.
 *
 * The preview is `dangerouslySetInnerHTML`, and `markdown-it` runs with
 * `html: true` so raw HTML in a document (or in an imported article)
 * passes straight through. Without this step a pasted `<img onerror>`
 * executes inside the Tauri webview, where `invoke()` is available.
 *
 * Formula output cannot simply run through DOMPurify: MathJax emits
 * self-contained `<svg>` with `data-mml-node` / `data-c` attributes and
 * nested `<g>`/`<path>`, and any attribute rewriting breaks rendering.
 * The adapter for WeChat already solved this by pulling formulas out
 * before processing and restoring them afterwards; the preview reuses
 * the same trick, so the sanitizer never sees a formula.
 */

import DOMPurify from "dompurify";

const FORMULA_BLOCK =
  /<section\s+class="[^"]*\bbaker-formula-block\b[^"]*"[^>]*>[\s\S]*?<\/section>/gi;
const FORMULA_INLINE =
  /<span\s+class="[^"]*\bbaker-formula-inline\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi;

const FORBIDDEN_TAGS = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "select",
  "option",
  "button",
  "meta",
  "link",
  "base",
  "template",
];

const FORBIDDEN_ATTR = ["srcdoc", "formaction", "action"];

/**
 * Replace every formula node with an opaque token and return a restore
 * function. Formulas are produced by our own MathJax pipeline, never by
 * the document, so they are trusted content.
 */
function maskFormulas(html: string): {
  masked: string;
  restore: (sanitized: string) => string;
} {
  const masked = new Map<string, string>();
  let index = 0;

  const mask = (match: string): string => {
    const token = `@@BAKER_MATH_${index}@@`;
    masked.set(token, match);
    index += 1;
    return token;
  };

  const stripped = html
    .replace(FORMULA_BLOCK, mask)
    .replace(FORMULA_INLINE, mask);

  return {
    masked: stripped,
    restore: (sanitized: string): string => {
      if (masked.size === 0) return sanitized;
      let result = sanitized;
      for (const [token, formula] of masked) {
        result = result.split(token).join(formula);
      }
      return result;
    },
  };
}

export interface SanitizeOptions {
  /** Extra tags to keep, e.g. when a caller knows it emits them. */
  addTags?: string[];
  addAttrs?: string[];
}

/**
 * Return HTML that is safe to inject into the app's own document.
 *
 * Runs in the browser and in jsdom-based tests. In a DOM-less runtime
 * (build scripts, SSR) there is nothing to protect, and the caller is
 * not rendering into a document, so the input passes through.
 */
export function sanitizeRenderedHtml(html: string, options: SanitizeOptions = {}): string {
  if (typeof window === "undefined") return html;

  const { masked, restore } = maskFormulas(html);
  const clean = DOMPurify.sanitize(masked, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTR,
    // `style` carries the inline look of imported articles; `target`
    // and `rel` are needed for outbound links to behave.
    ADD_ATTR: ["target", "rel", "style", ...(options.addAttrs ?? [])],
    ADD_TAGS: options.addTags ?? [],
    // Keep the document's own `data-*` markers (asset refs, image hints).
    ALLOW_DATA_ATTR: true,
  });

  return restore(clean);
}
