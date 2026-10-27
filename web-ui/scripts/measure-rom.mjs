#!/usr/bin/env node
// measure-rom.mjs — BUILD-TIME ROM measurement (the operator-locked banner
// value). Iterate git-ls-files over the repo, sum byte counts EXCLUDING
// build/lock/cache dirs and files, write the constant into
// src/lib/boot-consts.json. Run before `npm run build` in web-ui:
//   node web-ui/scripts/measure-rom.mjs && npm run build
// The displayed version is a baked SEMVER constant in the banner
// (v0.1.0); the JSON-epoch in _app/version.json stays for cache busting.
import { execSync } from 'node:child_process';
import { statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(new URL('..', import.meta.url).pathname, '..');
const OUT = join(REPO, 'web-ui', 'src', 'lib', 'boot-consts.json');

// git ls-files at the repo root (tracked files only = "the code").
const files = execSync('git ls-files', { cwd: REPO, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

// Exclude build/lock/cache artifacts (they are compiled output, not source).
const EXCLUDE_DIR_RE = /(node_modules|build|dist|\.svelte-kit|\.vercel|\.cache|logs|\.git)\//;
const EXCLUDE_NAME_RE = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/;

let totalBytes = 0;
let count = 0;
for (const rel of files) {
  if (EXCLUDE_DIR_RE.test(rel)) continue;
  const base = rel.split('/').pop();
  if (EXCLUDE_NAME_RE.test(base)) continue;
  try {
    totalBytes += statSync(join(REPO, rel)).size;
    count += 1;
  } catch {
    /* deleted-on-disk tracked file — skip (the build will regenerate it) */
  }
}

const romKiB = Number((totalBytes / 1024).toFixed(1));

// Preserve any existing xtermVersion (read from node_modules at prior build);
// re-read it if available.
const xtermPkg = join(REPO, 'web-ui', 'node_modules', '@xterm', 'xterm', 'package.json');
let xtermVersion = '';
try {
  xtermVersion = JSON.parse(readFileSync(xtermPkg, 'utf8')).version;
} catch {
  xtermVersion = '0.0.0';
}

const out = {
  romBytes: totalBytes,
  romKiB: romKiB,
  srcFiles: count,
  xtermVersion,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`rom ${totalBytes} bytes (${romKiB} KiB) over ${count} tracked files → ${OUT}`);
