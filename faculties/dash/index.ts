// faculties/dash/index.ts — the shell around the wire-protocol-V1 tree engine
// (faculties/tree.ts). The R2 frame machine (t:sseinit/ready/open/re/close,
// F/n/tr/m) is DEAD and must never be reintroduced; the round-3 fold/seq log is
// dead with the R3 wire. The tree IS the wire: entry (data+hp), dirty-only
// waves (no no-op, no hot re-emit), tx from/to/kind.

import { bootTree } from '../tree.js';

let booted = false;
/** boot once per process (the tree is the single writer; idempotent). */
export function bootIfNot(): void {
  if (booted) return;
  booted = true;
  void bootTree();
}

export {
  newSession, dropSession,
  sendTx, dispatchOp, startTurn,
} from '../tree.js';
