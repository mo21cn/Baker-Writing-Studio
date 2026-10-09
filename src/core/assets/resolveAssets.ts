import { resolveAssetFileUrl } from "./assetStorage";
import {
  filenameFromBakerAssetUrl,
  isBakerAssetUrl,
  listMarkdownImageUrls,
  replaceMarkdownImageUrl,
} from "./imageUrl";

export async function resolveMarkdownAssetUrls(
  docId: string | null,
  markdown: string,
): Promise<string> {
  if (!docId) {
    return markdown;
  }

  let result = markdown;
  for (const entry of listMarkdownImageUrls(markdown)) {
    if (!isBakerAssetUrl(entry.url)) {
      continue;
    }
    const filename = filenameFromBakerAssetUrl(entry.url);
    if (!filename) {
      continue;
    }

    const resolved = await resolveAssetFileUrl(docId, filename);
    if (resolved) {
      result = replaceMarkdownImageUrl(result, entry.url, resolved);
    }
  }

  return result;
}
