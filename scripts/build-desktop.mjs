#!/usr/bin/env node
/**
 * Build the desktop bundle for the platform this machine runs on.
 *
 * `bundle.targets` in `src-tauri/tauri.conf.json` cannot list both
 * installers: NSIS only bundles on Windows and DMG only on macOS, so a
 * shared list makes `tauri build` fail on either platform. This script
 * picks the one target the current machine can produce and hands it to
 * the CLI with `--bundles`, which overrides the config value.
 *
 * The mapping is deliberately one target per platform. A single platform
 * could produce several (Windows also offers MSI), but each extra target
 * is another toolchain to download and another way for the build to fail
 * after the installer we actually want has already been produced.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const BUNDLES_BY_PLATFORM = {
  win32: ["nsis"],
  darwin: ["dmg"],
  linux: ["deb", "appimage"],
};

const bundles = BUNDLES_BY_PLATFORM[process.platform];

if (!bundles) {
  console.error(`No desktop bundle is defined for platform "${process.platform}".`);
  process.exit(1);
}

const args = ["tauri", "build", "--bundles", ...bundles];

console.log(`> npx ${args.join(" ")}`);

// `npx` resolves to a `.cmd` shim on Windows, which `spawnSync` cannot
// execute without a shell.
const result = spawnSync("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
