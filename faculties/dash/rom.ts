// faculties/dash/rom.ts — the ROM / MEM line's numbers, computed at launch.
// CANON §3: ROM <int>k · MEM <n.n>MB.
//
// F4-locked semantics (operator-approved, 2026-10-29):
//   ROM = the carl project's DISK size in kB — a recursive walk of the
//         project root excluding node_modules, .git and build/dist output.
//         Computed once at launch, frozen for the process's life (it IS the
//         project's size, not a live number).
//   MEM = the current process RSS in MB (one decimal), read live at the
//         moment the ROM-MEM row prints.

import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'build', 'dist']);

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

/** The project root (the repo), resolved from this file's location. */
export const CARL_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

let romWalk: Promise<number> | null = null;

/**
 * ROM in kB (int): the launch-time walk, started the first time it is
 * awaited and memoized — recomputes NOTHING for the rest of the process.
 * rationale: the walk is async (readdir/stat), so "at launch" means the
 * first await, which is boot's ROM-MEM row — the only consumer.
 */
export function carlDiskSizeKb(root: string = CARL_ROOT): Promise<number> {
  if (!romWalk) {
    romWalk = dirSizeKib(root, EXCLUDED_DIRS).catch(() => 0);
  }
  return romWalk;
}

/** MEM in MB (live process RSS). Caller formats decimals. */
export function carlProcessMemMib(): number {
  return process.memoryUsage().rss / (1024 * 1024);
}
