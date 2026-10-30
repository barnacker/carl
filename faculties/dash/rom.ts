// faculties/dash/rom.ts — the ROM / MEM line's numbers, measured at launch.
//
// F4-locked semantics (v0.1.3.5 pin: dist ONLY, operator directive):
//   ROM = the DISK size of <root>/dist — a recursive byte-scale walk of
//         the compiled server output, in KiB (1024-byte scale, ceiling
//         per file). The round-3 runtime-set pin (dist + web-ui/build +
//         node_modules, ~48-49k KiB here) is superseded: the walk root
//         is now dist/ alone (a few tens of KiB on this host — an
//         environment-dependent value, not a fixed pin). Computed once
//         at first await, frozen for the process's life (it IS the
//         build's size, not a live number).
//   MEM = the current process RSS in MB (one decimal), read live at the
//         moment the value is carried (the tree's carl.mem).
//
// Symlink guard (defensive; dist/ on this host has no symlinks): a
// cross-root symlinked DIR is NOT walked (it would ride to another
// mount); a cross-root symlinked FILE counts the link's own size only.

import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

// the walk root: <root>/dist only (v0.1.3.5 pin; single dir, so the sum
// below never double-counts).
const EXCLUDED_DIRS = new Set<string>();

/**
 * Recursive size in KiB of `root`, skipping excluded dir names. Ceiling
 * per file (the byte-scale floor). A symlinked DIR that leaves the root is
 * skipped (no cross-root ride); a symlinked FILE or in-root symlink counts
 * the LINK's own size (no follow).
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
      st = await lstat(full);
    } catch {
      continue;
    }
    if (st.isFile()) {
      total += Math.ceil(st.size / 1024); // regular file
    } else if (st.isDirectory()) {
      if (excluded.has(name)) continue;
      total += await dirSizeKib(full, excluded); // real dir: walk
    } else if (st.isSymbolicLink()) {
      // symlink: resolve; cross-root = skip (no walk, no ride); in-root or
      // file-type = the link's own size (no follow)
      try {
        const real = await realpath(full);
        const inside = real === root || real.startsWith(root + path.sep);
        if (!inside) continue;
        total += Math.ceil(st.size / 1024);
      } catch { /* broken symlink: contributes nothing */ }
    }
  }
  return total;
}

/** The REPO root, derived from this module's own location: v0.1.3.5 places
 * this file at <root>/dist/faculties/dash/rom.js (tsc deep mirror, 3 up)
 * in the running process, and at <root>/faculties/dash/rom.js (2 up) under
 * dev. The production path contains '/dist/' (the compile mirror); the dev
 * path does not. A pure path rule — no env; the walk root is <root>/dist.
 */
const __ROM_MODULE_DIR = path.dirname(new URL(import.meta.url).pathname);
const __ROM_REPO_ROOT = __ROM_MODULE_DIR.includes('/dist/')
  ? path.resolve(__ROM_MODULE_DIR, '..', '..', '..') // product: <root>/dist/... → <root>
  : path.resolve(__ROM_MODULE_DIR, '..', '..');     // dev:     <root>/...      → <root>
export const CARL_ROOT = __ROM_REPO_ROOT;
/** The ROM walk root (v0.1.3.5 pin): <root>/dist only. */
export const CARL_RUNTIME_SET = [
  path.join(CARL_ROOT, 'dist'),
];

let romWalk: Promise<number> | null = null;

/**
 * ROM in KiB (int): the <root>/dist launch-time walk, started the first
 * time it is awaited and memoized (one promise, one settle) — recomputes
 * NOTHING for the rest of the process.
 */
export function carlRomKib(): Promise<number> {
  if (romWalk) return romWalk;
  romWalk = Promise.all(CARL_RUNTIME_SET.map((d) => dirSizeKib(d, EXCLUDED_DIRS)))
    .then((sizes) => sizes.reduce((a, b) => a + b, 0))
    .catch(() => 0);
  return romWalk;
}

/** MEM in MB (live process RSS). Caller formats decimals. */
export function carlProcessMemMib(): number {
  return process.memoryUsage().rss / (1024 * 1024);
}
