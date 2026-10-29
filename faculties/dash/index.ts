// faculties/dash — the DASH faculty.
// The carriage behind the terminal: how CARL talks with the operator —
// read in, speak out. This folder carries the whole V1 wire
// (the band: attach framing, the boot emitter, the turn emitter, and the
// session fan-out) and nothing else. web-ui/ renders these frames; no code
// here reaches for the DOM, and no code outside this folder touches the wire.
//
// Wire contract (locked 2026-10-29, CANON §4):
//   attach:  {t:'sseinit', session, tag} then {t:'ready', ok:true}
//   block:   {t:'open', id} / {t:'re', id, F, n, tr, c} / {t:'close', id}
//   row:     c = [state cell][decoration cell][2 padding spaces][text];
//            \n and \b travel in-band.
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
  c?: string; // row content, raw tape
}

export type Emit = (f: WireFrame) => void;

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

// --- row tape

export const SPIN = ['⣶', '⣧', '⣏', '⡟', '⠿', '⢻', '⣹', '⣼'];
export const DOT = '\u00B7';

/**
 * One screen row's tape: [state cell][decoration cell][text].
 * Both gutter cells are ALWAYS materialized (empty → a space) so alignment
 * never breaks (CANON §2: the 2-cell gutter is common to all rows). The
 * 2-char content margin rides in the text itself (byte-exact banner rows);
 * a row with no text is exactly 2 gutter chars (line 2 of the banner).
 */
function row(state: string, deco: string, text: string): string {
  return (state || ' ') + (deco || ' ') + text;
}

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

const HEADER = '  CARL · PROVISIONING TERMINAL v0.1.1';
const SELFTEST = '  - SELF-TEST -----------------------';
const RULE = '  -----------------------------------';
const READY = '  READY.';

/**
 * One rung's tape, byte-exact (CANON §3) — at settle:
 *   > DASH  ············  OK @ 0.3ms
 * Armed (mid-fill) the dots are sparse, the state cell holds the spinner.
 */
function rungRow(i: number, fill: number, state: string, word: string): string {
  const dots = DOT.repeat(fill) + ' '.repeat(DOTS - fill);
  const suffix = word === '' ? '' : '  ' + word;
  return row(state, '│', '  > ' + RUNGS[i].label + ' ' + dots + suffix);
}

function realSettleCost(): number {
  // the mock's "measured settle cost" — the settle path itself (a fake-probe
  // RT read): a few tenths of a ms up to a few ms, one decimal.
  return Math.round((0.2 + Math.random() * 2.1) * 10) / 10;
}

/**
 * The boot block, byte-exact (CANON §3):
 *   ┌   CARL · PROVISIONING TERMINAL v0.1.1
 *   │                        (blank row)
 *   │   - SELF-TEST -----------------------
 *   │   > DASH  ············  OK @ 0.3ms
 *   ... (6 rungs; the dots fill live, the settle word lands on elapsed)
 *   │   -----------------------------------
 *   │   ROM 931k · MEM 107.4MB
 *   └   READY.
 *   <blank row — the client's block caret rides its lead; wire-only>
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

  // the boot block is 13 line SLOTS (n=0..12) — the byte-exact banner.
  // A rung's dots fill by RE-emitting its own slot n (the client re-paints
  // that row in place, ripple-down); the settled word lands on the same n.
  const R0 = 3; // first rung slot
  const reAt = (n: number, c: string) => emit({ t: 're', id: 'boot', F: nextF(), n, tr: 0, c });

  reAt(0, row('', '┌', HEADER));
  await sleep(90);
  reAt(1, row('', '│', '')); // blank row (decoration │ only)
  await sleep(20);
  reAt(2, row('', '│', SELFTEST));
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

    reAt(n, rungRow(i, 0, SPIN[0], '')); // armed: spinner col 0, zero dots
    for (let d = 1; d <= DOTS; d++) {
      await sleep(tick);
      reAt(n, rungRow(i, d, SPIN[d % 8], '')); // live dot fill, same row
    }

    // settle: word @ n.nms (n.nms = the REAL measured settle cost);
    // FAULT/DEGRADED would carry the dot-field as full (12/12) first —
    // same shape, the register keeps a failure visible.
    const cost = realSettleCost();
    reAt(n, rungRow(i, DOTS, '', RUNGS[i].word + ' @ ' + cost.toFixed(1) + 'ms'));
    await sleep(50);
  }

  await sleep(520); // the settle/ROM-MEM hold (composes the total)
  reAt(9, row('', '│', RULE));
  await sleep(110);
  reAt(10, row('', '│', ROM_MEM_ROW()));
  await sleep(160);
  reAt(11, row('', '└', READY));
  await sleep(100);

  // the caret row (slot n=12): pure whitespace tape. The client's block
  // caret fades at its content-column lead — a client presentation element;
  // NEVER a wire byte, NEVER a gutter byte.
  reAt(12, '   ');
  emit({ t: 'close', id: 'boot' });
}

// ROM = node process size at launch (k); MEM = live server RSS (MB).
// Consistent units: ROM in KiB, MEM in MiB (same value, two magnitudes).
function ROM_MEM_ROW(): string {
  const m = process.memoryUsage();
  const romKib = Math.max(1, Math.round(m.rss / 1024));
  const memMib = (m.rss / (1024 * 1024)).toFixed(1);
  return `  ROM ${romKib}k · MEM ${memMib}MB`;
}

// --- the turn block: mock brain → 'Hello! I'm CARL-01' (CANON §5)

export const REPLY_TEXT = "Hello! I'm CARL-01";

/**
 * One conversation turn: opens turn-<N>, streams the reply row one frame at
 * a time at the system's pace, closes. The user's own row was painted
 * locally by the client — the server only owns the reply row.
 *   open → row('⣶', '', '')     thinking (spinner in col 0 of the reply row)
 *        → row('»', '', 'H')     first char: col 0 flips spinner → »
 *        → row('»', '', 'He…')   each subsequent frame appends (drip fill)
 *   close
 * Every frame carries the reply row so far (upstream rows never re-paint;
 * the client assembles per (id, n)).
 */
export async function startTurn(session: string, emit: Emit): Promise<void> {
  const s = stateFor(session);
  s.turn += 1;
  const id = 'turn-' + s.turn;
  let n = 0;
  const re = (c: string) => emit({ t: 're', id, F: nextF(), n: n++, tr: 0, c });

  emit({ t: 'open', id });

  // thinking: spinner in the gutter col 0 of the (still empty) reply row
  const thinks = 8 + Math.floor(Math.random() * 18);
  for (let i = 0; i < thinks; i++) {
    re(row(SPIN[i % 8], '', ''));
    await sleep(28);
  }

  // first character: the gutter flips spinner → » with the char
  re(row('»', '', REPLY_TEXT.slice(0, 1)));
  await sleep(90);

  // the rest: character bursts at the system's pace (mock brain drip; a
  // real model's token rate takes the same wire, same frames)
  let pos = 1;
  while (pos < REPLY_TEXT.length) {
    pos = Math.min(REPLY_TEXT.length, pos + 1 + Math.floor(Math.random() * 2));
    re(row('»', '', REPLY_TEXT.slice(0, pos)));
    await sleep(60 + Math.floor(Math.random() * 160));
  }

  emit({ t: 'close', id });
}
