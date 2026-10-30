// faculties/dash/index.ts — right FLUSHED (round-3, the tree epoch):
// this module used to carry the whole round-2 wire (WireFrame
// t:'sseinit'|'ready'|'open'|'re'|'close' + F, n, tr, c, m; runBoot; the
// row()/SPIN/DOT gutter-in-c machine). Round 3 (spec-of-record, 2026-10-30):
// the state tree IS the wire (faculties/tree.ts) and the banner is RENDERED
// client-side from carl.version + the selftest progress/mode/ms — so this
// file is a thin shell around the tree engine: the boot lifecycle and the
// turn entry point. No DOM, no frame machine, no character dumper left.

import { bootTree, startTurn, attach, detach } from '../tree.js';

/** boot once per process (the tree is the single writer; idempotent). */
let booted = false;
export function bootIfNot(): void {
  if (booted) return;
  booted = true;
  void bootTree();
}

/** attach an SSE conn to the tree's wave stream (snapshot-then-fold). */
export { attach, detach, startTurn };
