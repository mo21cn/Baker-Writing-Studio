// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveBlob, saveText } from "../src/core/export/saveFile";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => Boolean((globalThis as { isTauri?: boolean }).isTauri),
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

let createdBlobs: Blob[] = [];
let downloads: { filename: string; href: string }[] = [];

function enterTauriRuntime(): void {
  (globalThis as { isTauri?: boolean }).isTauri = true;
}

beforeEach(() => {
  invokeMock.mockReset();
  createdBlobs = [];
  downloads = [];
  delete (globalThis as { isTauri?: boolean }).isTauri;

  // jsdom implements neither object URLs nor a real anchor click, and the
  // browser path needs both.
  let counter = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    createdBlobs.push(blob);
    counter += 1;
    return `blob:mock/${counter}`;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ filename: this.download, href: this.href });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveText", () => {
  it("prefixes a UTF-8 BOM so editors that sniff the encoding detect it", async () => {
    const result = await saveText("你好，Markdown", {
      filename: "note.md",
      mime: "text/markdown",
      extension: "md",
    });

    expect(result.ok).toBe(true);
    expect(createdBlobs).toHaveLength(1);

    // `Blob.text()` runs the bytes through a TextDecoder, which strips a
    // leading BOM by default, so the raw bytes are the only place the BOM
    // is observable.
    const bytes = new Uint8Array(await createdBlobs[0].arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("你好，Markdown");
  });

  it("downloads under the requested file name", async () => {
    await saveText("x", { filename: "note.md", mime: "text/markdown", extension: "md" });

    expect(downloads).toEqual([{ filename: "note.md", href: "blob:mock/1" }]);
  });
});

describe("saveBlob", () => {
  it("keeps the payload byte-exact, so formats that reject a BOM stay valid", async () => {
    const result = await saveBlob(
      new Blob(["\\documentclass{article}"], { type: "application/x-tex" }),
      { filename: "doc.tex", mime: "application/x-tex", extension: "tex" },
    );

    expect(result.ok).toBe(true);
    expect(await createdBlobs[0].text()).toBe("\\documentclass{article}");
  });
});

describe("desktop runtime", () => {
  it("hands the payload to the Rust command instead of downloading", async () => {
    enterTauriRuntime();
    invokeMock.mockResolvedValue("C:\\Users\\me\\doc.tex");

    const result = await saveBlob(new Blob(["hello"]), {
      filename: "doc.tex",
      mime: "application/x-tex",
      extension: "tex",
      label: "LaTeX",
    });

    expect(result).toEqual({ ok: true, cancelled: false, path: "C:\\Users\\me\\doc.tex" });
    expect(downloads).toHaveLength(0);

    const [command, payload] = invokeMock.mock.calls[0];
    expect(command).toBe("save_bytes");
    expect(payload.filename).toBe("doc.tex");
    expect(payload.extension).toBe("tex");
    expect(payload.label).toBe("LaTeX");
    expect(atob(payload.base64Data)).toBe("hello");
  });

  it("derives the extension from the file name when none is given", async () => {
    enterTauriRuntime();
    invokeMock.mockResolvedValue("C:\\Users\\me\\note.md");

    await saveText("x", { filename: "note.md", mime: "text/markdown" });

    expect(invokeMock.mock.calls[0][1].extension).toBe("md");
  });

  it("reports a dismissed dialog as a cancellation, not a failure", async () => {
    enterTauriRuntime();
    invokeMock.mockResolvedValue(null);

    const result = await saveText("x", { filename: "note.md", mime: "text/markdown" });

    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it("reports a failed write instead of throwing", async () => {
    enterTauriRuntime();
    invokeMock.mockRejectedValue(new Error("disk full"));

    const result = await saveText("x", { filename: "note.md", mime: "text/markdown" });

    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(result.error).toBe("disk full");
  });
});
