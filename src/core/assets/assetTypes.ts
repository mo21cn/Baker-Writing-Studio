/** Markdown image URLs use this prefix; files live under assets/{docId}/ */
export const BAKER_ASSET_SCHEME = "baker-asset:";
/**
 * Legacy scheme from the original Read2MD Studio days.
 * Existing documents saved before the Baker Writing Studio rebrand
 * may still reference images with this prefix; keep parsing them so
 * old docs keep loading their localized images. New docs are always
 * written with BAKER_ASSET_SCHEME.
 */
export const LEGACY_R2MD_ASSET_SCHEME = "r2md-asset:";

export const WECHAT_IMAGE_HOSTS = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn"];

export interface LocalizeImagesResult {
  markdown: string;
  assetFiles: string[];
  warnings: string[];
}
