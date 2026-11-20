import { isTauriRuntime } from "../import/tauriRuntime";

export interface SaveFileOptions {
  /** File name proposed to the user, including the extension. */
  filename: string;
  /** MIME type of the payload. */
  mime: string;
  /**
   * Extension without the dot, used for the native file-type filter.
   * Defaults to the extension of `filename`.
   */
  extension?: string;
  /** Label shown next to the extension in the native filter list. */
  label?: string;
}

export interface SaveFileResult {
  ok: boolean;
  /** True when the user dismissed the native save dialog. */
  cancelled: boolean;
  /** Absolute path of the written file. Desktop only. */
  path?: string;
  error?: string;
}

const UTF8_BOM = "\uFEFF";

/**
 * Base64-encode bytes without blowing the argument limit of
 * `String.fromCharCode`, which throws on very large arrays.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function extensionOf(filename: string): string | undefined {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    return undefined;
  }
  return filename.slice(dot + 1);
}

/**
 * Save through the OS dialog.
 *
 * The browser's `Blob` + `<a download>` route never reaches a real save
 * dialog inside the Tauri webview — the click is simply swallowed — so the
 * desktop build hands the payload to a Rust command that opens the native
 * dialog and writes the bytes itself.
 */
async function saveOnDesktop(
  blob: Blob,
  options: SaveFileOptions,
): Promise<SaveFileResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const path = await invoke<string | null>("save_bytes", {
    filename: options.filename,
    extension: options.extension ?? extensionOf(options.filename) ?? null,
    label: options.label ?? null,
    base64Data: bytesToBase64(bytes),
  });

  if (path === null) {
    return { ok: false, cancelled: true };
  }

  return { ok: true, cancelled: false, path };
}

function saveInBrowser(blob: Blob, options: SaveFileOptions): SaveFileResult {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = options.filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return { ok: true, cancelled: false };
}

/** Save a blob to disk, using the native dialog on the desktop build. */
export async function saveBlob(
  blob: Blob,
  options: SaveFileOptions,
): Promise<SaveFileResult> {
  try {
    if (isTauriRuntime()) {
      return await saveOnDesktop(blob, options);
    }
    return saveInBrowser(blob, options);
  } catch (error) {
    return {
      ok: false,
      cancelled: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Save text, prefixing a UTF-8 BOM so editors that sniff the encoding
 * (Excel, Notepad on some locales) detect it correctly. Formats that must
 * stay byte-exact — `.tex` for one — use `saveBlob` instead.
 */
export async function saveText(
  text: string,
  options: Omit<SaveFileOptions, "mime"> & { mime?: string },
): Promise<SaveFileResult> {
  const mime = options.mime ?? "text/plain";
  const blob = new Blob([UTF8_BOM + text], { type: `${mime};charset=utf-8` });
  return saveBlob(blob, { ...options, mime });
}
