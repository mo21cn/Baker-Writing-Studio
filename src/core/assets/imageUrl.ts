import {
  BAKER_ASSET_SCHEME,
  LEGACY_R2MD_ASSET_SCHEME,
  WECHAT_IMAGE_HOSTS,
} from "./assetTypes";

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

export function isWechatHostedImage(url: string): boolean {
  try {
    const normalized = url.startsWith("//") ? `https:${url}` : url;
    const host = new URL(normalized).hostname.toLowerCase();
    return WECHAT_IMAGE_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
  } catch {
    return false;
  }
}

export function isRemoteHttpImage(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith("//");
}

export function isBakerAssetUrl(url: string): boolean {
  return url.startsWith(BAKER_ASSET_SCHEME) || url.startsWith(LEGACY_R2MD_ASSET_SCHEME);
}

export function toBakerAssetUrl(filename: string): string {
  return `${BAKER_ASSET_SCHEME}${filename}`;
}

export function filenameFromBakerAssetUrl(url: string): string | null {
  if (url.startsWith(BAKER_ASSET_SCHEME)) {
    return filenameFromAssetUrl(url, BAKER_ASSET_SCHEME);
  }
  if (url.startsWith(LEGACY_R2MD_ASSET_SCHEME)) {
    return filenameFromAssetUrl(url, LEGACY_R2MD_ASSET_SCHEME);
  }
  return null;
}

function filenameFromAssetUrl(url: string, scheme: string): string | null {
  const filename = url.slice(scheme.length).trim();
  return filename || null;
}

export function listMarkdownImageUrls(markdown: string): { alt: string; url: string }[] {
  const results: { alt: string; url: string }[] = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const alt = match[1] ?? "";
    const url = match[2]?.trim() ?? "";
    if (url) {
      results.push({ alt, url });
    }
  }
  return results;
}

export function replaceMarkdownImageUrl(markdown: string, fromUrl: string, toUrl: string): string {
  const pattern = new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegExp(fromUrl)}\\)`);
  return markdown.replace(pattern, (_match, alt: string) => `![${alt}](${toUrl})`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extensionFromImageUrl(url: string, contentType?: string): string {
  if (contentType) {
    const normalized = contentType.split(";")[0]?.trim().toLowerCase();
    if (normalized === "image/jpeg" || normalized === "image/jpg") return ".jpg";
    if (normalized === "image/png") return ".png";
    if (normalized === "image/gif") return ".gif";
    if (normalized === "image/webp") return ".webp";
    if (normalized === "image/bmp") return ".bmp";
    if (normalized === "image/svg+xml") return ".svg";
  }

  const wxFmt = /wx_fmt=(\w+)/i.exec(url);
  if (wxFmt) {
    const ext = wxFmt[1].toLowerCase();
    return ext === "jpeg" ? ".jpg" : `.${ext}`;
  }

  const path = new URL(url.startsWith("//") ? `https:${url}` : url).pathname.toLowerCase();
  for (const ext of [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]) {
    if (path.endsWith(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  }

  return ".jpg";
}

export function assetFilename(index: number, extension: string): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return `image-${String(index).padStart(3, "0")}${ext}`;
}
