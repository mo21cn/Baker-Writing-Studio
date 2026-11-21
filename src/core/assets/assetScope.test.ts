import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The desktop build stores localized images on disk and then serves them
 * back to the preview through Tauri's `asset://` protocol. Both steps are
 * gated by a path scope, and both scopes live outside the code that uses
 * them:
 *
 * - `src-tauri/capabilities/default.json` decides where the `fs` plugin may
 *   write, read and remove files. A path outside the scope is refused.
 * - `src-tauri/tauri.conf.json` decides which paths the `asset://` protocol
 *   may serve. A path outside the scope answers 403.
 *
 * The directory the images actually live in is defined in
 * `src/core/assets/assetStorage.ts`. Nothing but this test keeps the three
 * in step: the web build touches none of them, so a mismatch shows up only
 * as images that silently fail to save or render in the desktop app.
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

/** Paths the `asset://` protocol may serve. */
function readAssetProtocolScope(): string[] {
  const config = JSON.parse(readRepoFile("src-tauri", "tauri.conf.json")) as {
    app: { security: { assetProtocol: { enable: boolean; scope: string[] } } };
  };
  const { assetProtocol } = config.app.security;
  expect(assetProtocol.enable).toBe(true);
  return assetProtocol.scope.map((entry) => entry.replace(/\\/g, "/"));
}

/** Paths the `fs` plugin may read, write and remove. */
function readFsCapabilityScope(): string[] {
  const capability = JSON.parse(
    readRepoFile("src-tauri", "capabilities", "default.json"),
  ) as {
    permissions: ({ identifier: string; allow?: { path?: string }[] } | string)[];
  };

  const paths: string[] = [];
  for (const permission of capability.permissions) {
    if (typeof permission === "string") {
      continue;
    }
    for (const entry of permission.allow ?? []) {
      if (entry.path) {
        paths.push(entry.path.replace(/\\/g, "/"));
      }
    }
  }
  expect(paths.length).toBeGreaterThan(0);
  return paths;
}

/**
 * Does the scope grant access to `relativePath`?
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

describe("desktop asset storage scope", () => {
  it("covers the directory localized images are written to", () => {
    const assetsRoot = readAssetsRoot();

    expect(scopeCovers(readAssetProtocolScope(), assetsRoot)).toBe(true);
    expect(scopeCovers(readFsCapabilityScope(), assetsRoot)).toBe(true);
  });

  it("does not expose anything outside the assets directory", () => {
    const assetsRoot = readAssetsRoot();
    const scopes = [readAssetProtocolScope(), readFsCapabilityScope()];

    for (const scope of scopes) {
      // The whole app data dir.
      expect(scopeCovers(scope, "")).toBe(false);
      // A sibling of the assets directory.
      expect(scopeCovers(scope, `${assetsRoot}-other`)).toBe(false);
    }
  });
});
