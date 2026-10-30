// faculties/dash/rom.ts — the ROM / MEM line's numbers, computed at launch.
// CANON §3: ROM <int>k · MEM <n.n>MB.
//
// F4-locked semantics (operator-approved, 2026-10-29):
//   ROM = the DISK size of the compiled build output — a recursive byte-
//         scale walk of the dist/ directory ONLY (everything tsc emitted:
//         dist/main.js, dist/faculties/*). NEVER node_modules, source .ts,
//         web-ui, .git, or the repo root beyond dist. Landed round 2: the
//         early walk swept the project root and read ~70000k; dist alone is
//         the measure (~19k order, byte scale — not the raw du block scale).
//         Computed once at launch, frozen for the process's life (it IS the
//         build's size, not a live number).
//   MEM = the current process RSS in MB (one decimal), read live at the
//         moment the ROM-MEM row prints.

import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';

// the dist walk is PINNED to dist: no exclusion set at all, so it can never
// smell past it (round-2 operator definition: dist and only dist).
const EXCLUDED_DIRS = new Set<string>();

/**
 * Recursive size in KiB of `root`, skipping excluded dir names and non-
 * regular files. Symlinks: stat() follows, so a symlinked dir is walked and
 * a symlinked file counted; nothing in the project tree relies on either.
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
 * The ROM measure root: the compiled build output ONLY (<root>/dist). This
 * module lands at <root>/dist/faculties/dash/rom.js in the RUNNING process
 * (tsc emits it three levels below the repo root) and at <root>/faculties/
 * dash/rom.js in dev (two levels below it). So the pin keys off the same
 * fact it measures: the production path CONTAINS '/dist/' (the compile
 * mirror), the dev path does not. Up-to-repo = 3 levels if mapped under
 * dist, 2 otherwise; then the walked root is ALWAYS <repo>/dist — dist and
 * only dist, never the project root. A pure path rule: no exclusion list,
 * no stat walk, nothing that could smell past dist.
 */
const __ROM_MODULE_DIR = path.dirname(new URL(import.meta.url).pathname);
const __ROM_REPO_ROOT = __ROM_MODULE_DIR.includes('/dist/')
  ? path.resolve(__ROM_MODULE_DIR, '..', '..', '..') // product:  <root>/dist/... → <root>
  : path.resolve(__ROM_MODULE_DIR, '..', '..');     // dev:      <root>/...      → <root>
export const CARL_DIST = path.join(__ROM_REPO_ROOT, 'dist');
/** The project root (the repo), derived from the dist pin. */
export const CARL_ROOT = __ROM_REPO_ROOT;

let romWalk: Promise<number> | null = null;

/**
 * ROM in kB (int): the pinned dist-only launch-time walk, started the first
 * time it is awaited and memoized — recomputes NOTHING for the rest of the
 * process. Rationale: the walk is async (readdir/stat), so "at launch" means
 * the first await, which is boot's ROM-MEM row — the only consumer. The
 * default root is dist (the compiled build output), never the project root.
 */
export function carlDiskSizeKb(root: string = CARL_DIST): Promise<number> {
  if (!romWalk) {
    romWalk = dirSizeKib(root, EXCLUDED_DIRS).catch(() => 0);
  }
  return romWalk;
}

/** MEM in MB (live process RSS). Caller formats decimals. */
export function carlProcessMemMib(): number {
  return process.memoryUsage().rss / (1024 * 1024);
}
