/**
 * WeChat article → Markdown tool, exposed as a single pure function so the
 * tool page does not need to know about the editor store. Wraps the existing
 * `parseWechatHtml` / `parseGenericHtml` + `htmlToMarkdown` pipeline.
 *
 * The fetch side lives in `fetchImportUrl` (proxy in browser, Tauri in
 * desktop). This module is the thin orchestrator and intentionally has no UI
 * dependencies, so it can be reused by the existing import dialog or a future
 * REST API.
 */
import type { WechatArticleMeta } from "../import/importTypes";
import { htmlToMarkdown } from "../import/htmlToMarkdown";
import { parseGenericHtml } from "../import/parseGenericHtml";
import { parseWechatHtml } from "../import/parseWechatHtml";

export interface ConvertOptions {
  /** Include the title as a `# heading` at the top of the document. */
  includeTitle?: boolean;
  /** Skip the embedded metadata block (author, publishTime, accountName). */
  includeMetadata?: boolean;
}

export interface ConvertResult {
  markdown: string;
  title: string;
  meta: WechatArticleMeta;
  warnings: string[];
}

const DEFAULT_OPTIONS: Required<ConvertOptions> = {
  includeTitle: true,
  includeMetadata: false,
};

function buildMetadataBlock(meta: WechatArticleMeta): string {
  const lines: string[] = [];
  if (meta.accountName) {
    lines.push(`- **作者**: ${meta.accountName}`);
  }
  if (meta.publishTime) {
    lines.push(`- **发布时间**: ${meta.publishTime}`);
  }
  if (meta.sourceUrl) {
    lines.push(`- **原文链接**: ${meta.sourceUrl}`);
  }
  if (lines.length === 0) {
    return "";
  }
  return lines.join("\n");
}

function detectKind(html: string): "wechat" | "generic" {
  if (html.includes("js_content") || html.includes("mp.weixin.qq.com")) {
    return "wechat";
  }
  return "generic";
}

/**
 * Convert a WeChat article HTML string into a Markdown document.
 *
 * Pure function — no fetch, no editor state. Caller supplies the HTML.
 */
export function convertWechatHtmlToMarkdown(
  html: string,
  sourceUrl = "",
  options: ConvertOptions = {},
): ConvertResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const kind = detectKind(html);

  const parsed =
    kind === "wechat"
      ? parseWechatHtml(html, sourceUrl)
      : parseGenericHtml(html, sourceUrl);

  let body = htmlToMarkdown(parsed.contentHtml, parsed.title, parsed.codeBlocks, parsed.mathBlocks);

  // `htmlToMarkdown` prepends a `# heading` automatically when a title is
  // present. If the caller asked us to skip the title, strip the leading
  // heading. If metadata is requested, inject it just after the heading.
  const titleHeading = opts.includeTitle ? "" : "\n";
  if (!opts.includeTitle && parsed.title) {
    const headingRe = new RegExp(`^#\\s+${escapeRegExp(parsed.title)}\\s*\\n+`);
    body = body.replace(headingRe, "");
  }

  if (opts.includeMetadata && parsed.meta) {
    const block = buildMetadataBlock(parsed.meta);
    if (block) {
      if (body.startsWith("# ")) {
        const firstBreak = body.indexOf("\n\n");
        if (firstBreak >= 0) {
          body = body.slice(0, firstBreak) + "\n\n" + block + "\n" + body.slice(firstBreak);
        } else {
          body = body + "\n\n" + block;
        }
      } else {
        body = block + "\n\n" + body;
      }
    }
  }

  return {
    markdown: body.trim() + titleHeading,
    title: parsed.title,
    meta: parsed.meta,
    warnings: [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
