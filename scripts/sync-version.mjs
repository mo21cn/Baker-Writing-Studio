#!/usr/bin/env node
/**
 * Keep the version in one place: `package.json`.
 *
 * Tauri reads `src-tauri/tauri.conf.json`, and Cargo has its own
 * manifest, so the same number was hard-coded in three files (plus a
 * stale `PACKAGE_VERSION` define in vite.config.ts until now). This
 * script syncs the two derived copies, and `--check` fails CI when they
 * drift.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const check = process.argv.includes("--check");

const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const pkg = JSON.parse(read("package.json"));
const version = pkg.version;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`package.json has an invalid version: ${String(version)}`);
  process.exit(1);
}

const targets = [
  {
    file: "src-tauri/tauri.conf.json",
    pattern: /("version"\s*:\s*")[^"]+(")/,
    replacement: `$1${version}$2`,
  },
  {
    file: "src-tauri/Cargo.toml",
    pattern: /^(version\s*=\s*")[^"]+(")/m,
    replacement: `$1${version}$2`,
  },
];

let drifted = 0;

for (const { file, pattern, replacement } of targets) {
  const before = read(file);
  if (!pattern.test(before)) {
    console.error(`${file}: version field not found`);
    process.exit(1);
  }
  const after = before.replace(pattern, replacement);
  if (before === after) continue;
  drifted += 1;
  if (!check) fs.writeFileSync(path.join(root, file), after, "utf8");
}

if (check) {
  if (drifted > 0) {
    console.error(
      `version drift: package.json=${version}, ${drifted} file(s) out of sync. Run "npm run version:sync".`,
    );
    process.exit(1);
  }
  console.log(`version ok: ${version}`);
} else {
  console.log(drifted > 0 ? `synced to ${version} in ${drifted} file(s)` : `already ${version}`);
}
