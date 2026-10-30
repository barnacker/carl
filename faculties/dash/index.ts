// faculties/dash — the DASH faculty.
// The carriage behind the terminal: how CARL talks with the operator —
// read in, speak out. This folder carries the whole V1 wire
// (the band: attach framing, the boot emitter, the turn emitter, and the
// session fan-out) and nothing else. web-ui/ renders these frames; no code
// here reaches for the DOM, and no code outside this folder touches the wire.
//
// Wire contract (locked 2026-10-29, CANON §4; round-2 deltas 2026-10-30):
//   attach:  {t:'sseinit', session, tag} then {t:'ready', ok:true}
//   block:   {t:'open', id} / {t:'re', id, F, n, tr, c} / {t:'close', id}
//            open/close are bound per instance id ('boot', 'turn-1', ...):
//            open BEFORE the first re of that id, close AFTER the last.
//   row:     c is CONTENT-ONLY: no gutter bytes, no box-drawing, no
//            guillemets, no braille in c. Gutter is client-derived from m.
//   pacing:  PASS-FIRST — the server emits at the system's pace (timers and
//            character bursts); no server-side frame buffer, no looper.
//   boot:    stateful per session — the block is born once; its frame tape
//            is kept, so a re-attach re-plays it. Dedup is by (id,n): the
//            client resumes at its last acked n without dup.

export interface WireFrame {
  t: 'sseinit' | 'ready' | 'open' | 're' | 'close';
  session?: string;
  tag?: string;
  ok?: boolean;
  id?: string;
  F?: number; // global displayed-flow counter — monotonic, never reset
  n?: number; // per-block sequence, 0-based, zero on each open
  tr?: number; // round/trace index (server-internal)
  c?: string; // row content, content-only (no gutter bytes — round 2)
  m?: string; // gutter class: BOOT, USR, THRU, ANS, CARET, or IDLE
}

export type Emit = (f: WireFrame) => void;
import { carlDiskSizeKb, carlProcessMemMib } from './rom.js';

// --- the flow counter (server-assigned, monotonic across the process)

let F = 0;
function nextF(): number {
  return F++;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms);
    t.unref?.();
  });
}

// --- session fan-out (the only chamber)

interface Conn {
  tag: string;
  send: Emit;
}

interface Session {
  conns: Map<string, Conn>; // tag → open SSE conn
  bootTape: WireFrame[]; // the 'boot' block in frame order, kept for re-play
  booted: boolean; // boot block has been born
  turn: number; // turn blocks opened on this session
}

const sessions = new Map<string, Session>();

function stateFor(session: string): Session {
  let s = sessions.get(session);
  if (!s) {
    s = { conns: new Map(), bootTape: [], booted: false, turn: 0 };
    sessions.set(session, s);
  }
  return s;
}

/** send a frame to every live conn of a session; boot 're' frames are taped. */
function push(session: string, f: WireFrame): void {
  const s = stateFor(session);
  if (f.t === 're' && f.id === 'boot') s.bootTape.push(f);
  for (const conn of s.conns.values()) conn.send(f);
}

export const dashboard = {
  /** attach: sseinit → ready → boot block (born once, re-played after). */
  attach(session: string, tag: string, send: Emit): void {
    const s = stateFor(session);
    s.conns.set(tag, { tag, send });
    send({ t: 'sseinit', session, tag });
    send({ t: 'ready', ok: true });
    if (s.booted) {
      // re-attach: replay the tape (the client dedups by (id,n))
      for (const f of s.bootTape) send(f);
      return;
    }
    void runBoot(session, send);
  },

  detach(session: string, tag: string): void {
    stateFor(session).conns.delete(tag);
  },

  /** fan one frame out to every live conn of a session. */
  emit(session: string, _lane: 'boot' | 'turn', f: WireFrame): void {
    push(session, f);
  },
};

// --- row tape (round 2: content-only)

export const DOT = '\u00B7'; // the 12-dot self-test field (content byte)

/**
 * Round-2 wire: c is CONTENT ONLY (no gutter bytes; the gutter is the
 * client's pure-CSS ::before driven by frame m). The 2-cell gutter tape and
 * the SPIN braille array are GONE from the server; the client derives the
 * gutter from m (BOOT, USR, THRU, ANS, CARET, IDLE).
 */

// --- the boot block: the mock self-test ceiling (6 rungs, ~3 s readable)

interface Rung {
  label: string;
  word: 'OK' | 'DEGRADED' | 'FAULT';
  window: [number, number]; // mock pacing window, ms (day-tunable dial)
}

// Locked rungs, locked order — DASH first (self-tests the interface before
// anything else), LLM1 last (end of the chain).
const RUNGS: Rung[] = [
  { label: 'DASH', word: 'OK', window: [150, 300] },
  { label: 'IMMU', word: 'OK', window: [250, 500] },
  { label: 'TELE', word: 'OK', window: [350, 650] },
  { label: 'NERV', word: 'OK', window: [350, 650] },
  { label: 'CRTX', word: 'OK', window: [400, 750] },
  { label: 'LLM1', word: 'OK', window: [600, 1050] },
];

const DOTS = 12;

const HEADER = '  CARL · PROVISIONING TERMINAL v0.1.2';
const SELFTEST = '  - SELF-TEST -----------------------';
const RULE = '  -----------------------------------';
const READY = '  READY.';

/**
 * One rung's tape, byte-exact (CANON §3) — at settle:
 *   DASH  ············  OK @ 0.3ms
 * Armed (mid-fill) the dots are sparse. Round 2 (brief-locked): the dot field
 * COLLAPSES to the settle word + REAL n.nms on the final re of the rung
 * (e.g. the rung settles to "OK @ 0.3ms"); the word is no longer 5-char
 * padded (the mandate is walked back). No width mandate this round.
 */
function rungRow(i: number, fill: number, word: string, ms?: number): string {
  // round 2: settle re → dot field collapses to the settle word + the real
  // measured n.nms; mid-fill re → the sparse dot field (spaces past fill).
  const field = word !== '' ? word + (ms !== undefined ? ' @ ' + ms.toFixed(1) + 'ms' : '')
                            : (DOT.repeat(fill) + ' '.repeat(DOTS - fill));
  return '  > ' + RUNGS[i].label + '  ' + field; // content-only: no gutter bytes
}

function realSettleCost(): number {
  // the mock's "measured settle cost" (ms, one decimal) — the settle path
  // itself (a fake-probe RT read): a few tenths of a ms up to a few ms.
  // Round 2: the value rides the settle re as REAL n.nms (no 5-char
  // padding on the word; no width mandate).
  return Math.round((0.2 + Math.random() * 2.1) * 10) / 10;
}

/**
 * The boot block, byte-exact (CANON §3):
 *    CARL · PROVISIONING TERMINAL v0.1.2
 *                   (blank row)
 *    - SELF-TEST -----------------------
 *    > DASH  ...dots...  OK          (settle: dot field → word + n.nns)
 *   ... (6 rungs; the dots fill live, the settle word + ms lands on elapsed)
 *    -----------------------------------
 *    ROM 19k · MEM 107.4MB   (ROM = the dist-only walk, pin locked)
 *    READY.
 *   <blank row — the client's block caret rides its lead; wire-only>
 * Gutter is client-derived (CSS class from frame m); the frame chars (┌ │ └)
 * and the spinner (⣶…⣼) live in the CSS, not the wire.
 */
export async function runBoot(session: string, send: Emit): Promise<void> {
  // deliver through the caller's own send (the live deliverable), while the
  // 're' frames are taped for re-attach replay — the boot block is born
  // server-side and keeps its tape even when no conn is listening (V1 mock
  // chain: the self-test ran whether or not a terminal was watching).
  const local = stateFor(session);
  local.booted = true;
  const emit = (f: WireFrame) => {
    if (f.t === 're' && f.id === 'boot') local.bootTape.push(f);
    send(f);
  };
  emit({ t: 'open', id: 'boot' });

  // ROM = the DISK size of the compiled build output: a byte-scale walk of
  // <root>/dist ONLY (dist and only dist — node_modules, source .ts, web-ui,
  // .git, and the repo root besides are never touched). MEM = live process
  // RSS (MB). F4-locked semantics, round-2 dist-pin. The walk is memoized:
  // recomputes NOTHING for the rest of the process.
  const romK = await carlDiskSizeKb();
  const memMib = carlProcessMemMib().toFixed(1);

  // the boot block is 13 line SLOTS (n=0..12) — the byte-exact banner.
  // A rung's dots fill by RE-emitting its own slot n (the client re-paints
  // that row in place, ripple-down); the settled word lands on the same n.
  const R0 = 3; // first rung slot
  const reAt = (n: number, m: string, c: string) => emit({ t: 're', id: 'boot', F: nextF(), n, tr: 0, c, m });

  reAt(0, 'BOOT', HEADER);
  await sleep(90);
  reAt(1, 'IDLE', ''); // blank row (client draws the frame bar via position)
  await sleep(20);
  reAt(2, 'BOOT', SELFTEST);
  await sleep(100);

  // draw each rung's window ONCE from its range (fixed for this boot); the
  // six windows + the settle/ROM-MEM hold compose the mock total
  const windows = RUNGS.map((r) =>
    Math.round(r.window[0] + Math.random() * (r.window[1] - r.window[0])),
  );

  for (let i = 0; i < RUNGS.length; i++) {
    const n = R0 + i; // the rung's fixed line slot
    const windowMs = windows[i];
    // ~12 ticks per rung; sleep = window/12 minus a frame's event-loop cost,
    // so the rung's WALL time ≈ its mock window (dials are mock constants)
    const tick = Math.max(3, Math.floor(windowMs / DOTS) - 5);

    reAt(n, 'BOOT', rungRow(i, 0, '')); // armed: CSS spinner, zero dots
    for (let d = 1; d <= DOTS; d++) {
      await sleep(tick);
      reAt(n, 'BOOT', rungRow(i, d, '')); // live dot fill, same row
    }

    // settle: dot field collapses to settle word + REAL measured n.nms
    // (brief §4, 2026-10-30: no width mandate — no padding to 5 chars).
    // FAULT/DEGRADED would carry the dot-field as full (12/12) first —
    // same shape, the register keeps a failure visible.
    const cost = realSettleCost();
    reAt(n, 'THRU', rungRow(i, DOTS, RUNGS[i].word, cost));
    await sleep(50);
  }

  await sleep(520); // the settle/ROM-MEM hold (composes the total)
  reAt(9, 'BOOT', RULE);
  await sleep(110);
  reAt(10, 'BOOT', `  ROM ${romK}k · MEM ${memMib}MB`);
  await sleep(160);
  reAt(11, 'BOOT', READY);
  await sleep(100);

  // the caret row (slot n=12): the 2-char content margin, i.e. pure
  // whitespace tape. The client's tail (textarea) rides here — client
  // presentation, never a wire byte, never a gutter byte.
  reAt(12, 'IDLE', '    ');
  emit({ t: 'close', id: 'boot' });
}

// --- the turn block: mock brain → 'Hello! I'm CARL-01' (CANON §5)

export const REPLY_TEXT = "Hello! I'm CARL-01";

/**
 * One conversation turn: opens turn-<N>, streams the reply ONE CHARACTER AT
 * A TIME (brief §7: byte-for-byte streaming; one reply per turn), closes.
 * The user's own row was frozen locally by the client on Enter — the server
 * only owns the reply row (and its gutter marker m: THRU while thinking,
 * ANS from the first char). c is content-only — no spin bytes, no guillemets:
 *   open → re(c:'', m:THRU)              thinking (CSS spinner via m=THRU)
 *        → re(c:'H', m:ANS)              first char: gutter THRU→ANS (CSS)
 *        → re(c:'H', m:ANS)              one char per frame (drip fill)
 *   close
 * Every frame carries the reply prefix (c = the reply row so far, one extra
 * char); upstream rows never re-paint; the client assembles per (id, n) and
 * appends the delta to the same content node.
 */
export async function startTurn(session: string, emit: Emit): Promise<void> {
  const s = stateFor(session);
  s.turn += 1;
  const id = 'turn-' + s.turn;
  let n = 0;
  const re = (m: string, c: string) => emit({ t: 're', id, F: nextF(), n: n++, tr: 0, c, m });

  emit({ t: 'open', id });

  // thinking: CSS spinner on the (still empty) reply row — m=THRU drives
  // the .spin gutter cell; NO spinner byte travels in c (round-2 rule).
  const thinks = 8 + Math.floor(Math.random() * 18);
  for (let i = 0; i < thinks; i++) {
    re('THRU', '');
    await sleep(28);
  }

  // the reply drip: ONE frame per character, byte-for-byte (brief §7)
  for (let i = 0; i < REPLY_TEXT.length; i++) {
    re('ANS', REPLY_TEXT.slice(0, i + 1));
    await sleep(90); // the machine's drip cadence (mock; one char per frame)
  }

  emit({ t: 'close', id });
}
