import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The desktop build serves localized images through Tauri's `asset://`
 * protocol, and that protocol answers 403 for every path outside the
 * configured scope.
 *
 * The scope lives in `src-tauri/tauri.conf.json` and the directory the
 * images are actually written to lives in `src/core/assets/assetStorage.ts`.
 * Nothing but this test keeps the two in step: the web build never touches
 * either of them, so a mismatch shows up only as a broken image in the
 * desktop preview, with no error surfaced in the UI.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(repoRoot, ...segments), "utf8");
}

/** The storage root for localized images, relative to the app data dir. */
function readAssetsRoot(): string {
  const source = readRepoFile("src", "core", "assets", "assetStorage.ts");
  const match = source.match(/const ASSETS_ROOT\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("ASSETS_ROOT not found in src/core/assets/assetStorage.ts");
  }
  return match[1].replace(/\\/g, "/").replace(/\/+$/, "");
}

function readAssetScope(): string[] {
  const config = JSON.parse(readRepoFile("src-tauri", "tauri.conf.json")) as {
    app: { security: { assetProtocol: { enable: boolean; scope: string[] } } };
  };
  const { assetProtocol } = config.app.security;
  expect(assetProtocol.enable).toBe(true);
  return assetProtocol.scope.map((entry) => entry.replace(/\\/g, "/"));
}

/**
 * Does the scope grant the asset protocol access to `relativePath`?
 *
 * `$APPDATA` resolves to the app data dir, so a scope entry is a path
 * relative to that dir.
 */
function scopeCovers(scope: string[], relativePath: string): boolean {
  return scope.some((entry) => {
    if (!entry.startsWith("$APPDATA/")) {
      return false;
    }
    const rest = entry.slice("$APPDATA/".length);
    if (rest.endsWith("/**")) {
      const prefix = rest.slice(0, -"/**".length);
      return prefix === "" || relativePath === prefix || relativePath.startsWith(`${prefix}/`);
    }
    return rest === relativePath;
  });
}

describe("Tauri asset protocol scope", () => {
  it("covers the directory localized images are written to", () => {
    expect(scopeCovers(readAssetScope(), readAssetsRoot())).toBe(true);
  });

  it("does not expose anything outside the assets directory", () => {
    const scope = readAssetScope();
    const assetsRoot = readAssetsRoot();

    // The whole app data dir.
    expect(scopeCovers(scope, "")).toBe(false);
    // A sibling of the assets directory.
    expect(scopeCovers(scope, `${assetsRoot}-other`)).toBe(false);
  });
});
