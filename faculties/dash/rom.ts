// faculties/dash/rom.ts — the ROM / MEM line's numbers, measured at launch.
//
// F4-locked semantics (round 3: the runtime-set re-pin, CARL-01 brief §7.3):
//   ROM = the DISK size of the RUNTIME SET — a recursive byte-scale walk of
//         the three directories the process actually loads at runtime:
//         <root>/dist + <root>/web-ui/build + <root>/node_modules — in KiB
//         (1024-byte scale, ceiling per file). dist only was the round-2
//         pin (~19k); the round-3 pin covers what the service actually runs
//         (node_modules-dominated; ~48500-49000 KiB, environment dependent).
//         Computed once at first await, frozen for the process's life (it IS
//         the build's size, not a live number).
//   MEM = the current process RSS in MB (one decimal), read live at the
//         moment the value is carried (the tree's carl.mem).

import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';

// the runtime set: dist + web-ui/build + node_modules (first-resolves-wins
// walk order; the three dirs are disjoint, so order never double-counts).
const EXCLUDED_DIRS = new Set<string>();

/**
 * Recursive size in KiB of `root`, skipping excluded dir names and non-
 * regular files. Ceiling per file (the byte-scale floor). Symlinks: stat()
 * follows, so a symlinked dir is walked and a symlinked file counted;
 * nothing in the project tree relies on either.
 */
export async function dirSizeKib(root: string, excluded: Set<string>): Promise<number> {
  let total = 0;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return total; // unreadable dir: contributes nothing
  }
  for (const name of entries) {
    const full = path.join(root, name);
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (excluded.has(name)) continue;
      total += await dirSizeKib(full, excluded);
    } else if (st.isFile()) {
      total += Math.ceil(st.size / 1024);
    }
  }
  return total;
}

/**
 * The REPO root, derived from this module's own location: round 3 places
 * this file at <root>/dist/faculties/dash/rom.js (tsc deep mirror, 3 up) in
 * the running process, and at <root>/faculties/dash/rom.js (2 up) under dev.
 * The production path contains '/dist/' (the compile mirror); dev does not.
 * A pure path rule — no env, no exclusion list beyond the runtime set.
 */
const __ROM_MODULE_DIR = path.dirname(new URL(import.meta.url).pathname);
const __ROM_REPO_ROOT = __ROM_MODULE_DIR.includes('/dist/')
  ? path.resolve(__ROM_MODULE_DIR, '..', '..', '..') // product: <root>/dist/... → <root>
  : path.resolve(__ROM_MODULE_DIR, '..', '..');     // dev:     <root>/...      → <root>
export const CARL_ROOT = __ROM_REPO_ROOT;
/** The runtime set (round-3 ROM pin): the three dirs the process loads. */
export const CARL_RUNTIME_SET = [
  path.join(CARL_ROOT, 'dist'),
  path.join(CARL_ROOT, 'web-ui', 'build'),
  path.join(CARL_ROOT, 'node_modules'),
];

const romWalk: Promise<number> | null = null;
let romKib: number | null = null;

/**
 * ROM in KiB (int): the RUNTIME-SET launch-time walk, started the first time
 * it is awaited and memoized — recomputes NOTHING for the rest of the
 * process. Sum of the three set dirs (disjoint, no double count).
 */
export function carlRomKib(): Promise<number> | number {
  if (romKib !== null) return romKib;
  const walk = Promise.all(CARL_RUNTIME_SET.map((d) => dirSizeKib(d, EXCLUDED_DIRS)))
    .then((sizes) => sizes.reduce((a, b) => a + b, 0));
  void walk.then((v) => { romKib = v; }).catch(() => { romKib = 0; });
  return walk;
}

/** MEM in MB (live process RSS). Caller formats decimals. */
export function carlProcessMemMib(): number {
  return process.memoryUsage().rss / (1024 * 1024);
}
