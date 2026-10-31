// faculties/tree.ts — the CARL-01 v0.2.0 wire-protocol-V1 tree engine.
//
// ENVELOPE (every frame, kd and tx): { t, from, to }.
//
// kd frames (kernel data = the tree/state):
//   ENTRY (on connect — the only frame sent on connect, then SILENCE):
//     { t:'kd', from:'carl', to:'<oper-id>', data:{...path->value...}, hp:{...handle->path...} }
//   WAVE (only when something changed, on the 60Hz tick that has dirty data):
//     { t:'kd', from:'<faculty>', to:'<oper-id>', tick:N, seq_end:N, dirty:{handle:value} }
//     NO no-op waves: dirty empty => no frame. NO hot-field re-emit: a handle
//     rides dirty ONLY while its value is actually changing (settled = absent).
//   RECONNECT (V1): a fresh entry (current tree + fresh hp) — no fold-from-seq.
//
// SESSION ID: server-minted. The client connects to SSE with no ID; the
// server generates oper-<random> and returns it in the entry frame's 'to'.
//
// KEY SHAPE: the selftest keys live under the DRIVER (the R3 double-carl bug,
// carl.carl.selftest.*, is dead): carl.immu.selftest.<target>.{mode,progress,ms}.
// Faculty registry: carl.faculties.<short>.mode = an object {mode: ...}, NOT null.
//
// dirty: a flag per leaf, set ONLY when a write changes the value (new != old).
// The 60Hz tick clock stays; the FLUSH emits a wave only when dirty is
// non-empty. dirty keys are binned by the UNDER-DRIVER faculty prefix, so a
// wave's 'from' is the faculty driving the change (immu for selftest, crtx for
// chat mode, carl for root).

let booting = false;      // the boot sweep is in flight (no selftest op meanwhile)
let selftestBusy = false; // a selftest sweep is running (ops queue, not parallel)
const selftestQueue: string[] = []; // pending 'selftest' tokens (op: serve queued, rest 202)

type LeafValue = string | number | boolean | object | null;

interface Leaf {
  path: string;
  value: LeafValue;
  dirty: boolean; // set on change-write, cleared when it rides a wave
}

interface Session {
  id: string;               // oper-<random> (server-minted)
  send: (f: unknown) => void;
  aliveness: number;        // last tick at which this session got its entry
  route: string;            // the 'to' value for waves: the oper id
}

// --- flat handle table + dirty flags -------------------------------------------

const leaves = new Map<number, Leaf>();
const handleByPath = new Map<string, number>();
let nextHandle = 1;

function ensureLeaf(path: string): number {
  const found = handleByPath.get(path);
  if (found !== undefined) return found;
  const handle = nextHandle++;
  leaves.set(handle, { path, value: null, dirty: true });
  handleByPath.set(path, handle);
  return handle;
}

function leafValue(path: string): LeafValue {
  const h = handleByPath.get(path);
  return h === undefined ? null : leaves.get(h)!.value;
}

// --- tree writes (dirty only on real change) ------------------------------------

/** write one leaf; a same-value write sets NO dirty (no-change = no wire). */
export function treeSet(path: string, value: LeafValue): void {
  const handle = ensureLeaf(path);
  const leaf = leaves.get(handle)!;
  if (leaf.value === value) return;
  leaf.value = value;
  leaf.dirty = true;
}

/** read a leaf (null if unregistered). */
export function treeGet(path: string): LeafValue {
  return leafValue(path);
}

/** register a faculty: presence of carl.faculties.<short> = registration.
    V1: the value is an OBJECT {mode: ...}, never null. */
export function facultyRegister(short: string, mode: string = 'idle'): void {
  treeSet('carl.faculties.' + short, { mode });
}

export function facultyMode(short: string, mode: string): void {
  const cur = leafValue('carl.faculties.' + short);
  const o: { [k: string]: unknown } = (typeof cur === 'object' && cur !== null) ? { ...(cur as object) } : {};
  o.mode = mode;
  treeSet('carl.faculties.' + short, o);
}

// --- the selftest keys (under the DRIVER: carl.<driver>.selftest.<target>.) -------

export function selftestBegin(driver: string, target: string): void {
  treeSet('carl.' + driver + '.selftest.' + target + '.mode', 'active');
  treeSet('carl.' + driver + '.selftest.' + target + '.progress', 0);
}

export function selftestProgress(driver: string, target: string, pct: number): void {
  const p = Math.max(0, Math.min(100, Math.round(pct))); // uint8 0..100
  treeSet('carl.' + driver + '.selftest.' + target + '.progress', p);
}

export function selftestPass(driver: string, target: string, ms: number): void {
  const base = 'carl.' + driver + '.selftest.' + target;
  treeSet(base + '.progress', 100);
  treeSet(base + '.ms', Math.round(ms * 10) / 10); // float, arrives with pass
  treeSet(base + '.mode', 'pass');
}

export function selftestFault(driver: string, target: string): void {
  const base = 'carl.' + driver + '.selftest.' + target;
  treeSet(base + '.progress', 100);
  treeSet(base + '.mode', 'fault'); // no ms (the client paints 12 dots + 'FAULT')
}

// --- the session table (server-minted oper ids; frames routed by 'to') -----------

const sessions = new Map<string, Session>();

export function newSession(send: (f: unknown) => void): Session {
  let id = '';
  do { id = 'oper-' + Math.random().toString(36).slice(2, 10); } while (sessions.has(id));
  const s: Session = { id, send, aliveness: 0, route: id };
  sessions.set(id, s);
  return s;
}

export function dropSession(id: string): void {
  sessions.delete(id);
}

export function routeSession(id: string): Session | undefined {
  return sessions.get(id);
}

// --- routing helpers ---------------------------------------------------------------

/** the underline faculty for a path: the first segment after 'carl.' that is
    not 'faculties' (immu / crtx / ...) — 'carl' for the root keys. */
function facultyOf(path: string): string {
  const seg = path.split('.');
  if (seg[0] !== 'carl' || seg.length < 2) return 'carl';
  const first = seg[1];
  if (first === 'faculties') return 'carl'; // the registry rides root
  return first;
}

/** bin currently-dirty handles by their driving faculty: handle -> value. */
function drainDirty(): Map<string, { [h: string]: LeafValue }> {
  const bins = new Map<string, { [h: string]: LeafValue }>();
  for (const [h, leaf] of leaves) {
    if (!leaf.dirty) continue;
    let b = bins.get(facultyOf(leaf.path));
    if (!b) { b = {}; bins.set(facultyOf(leaf.path), b); }
    b[String(h)] = leaf.value;
  }
  return bins;
}

function hpTable(): { [h: string]: string } {
  const out: { [h: string]: string } = {};
  for (const [path, h] of handleByPath) out[String(h)] = path;
  return out;
}

function dataSnapshot(): { [p: string]: LeafValue } {
  const out: { [p: string]: LeafValue } = {};
  for (const leaf of leaves.values()) out[leaf.path] = leaf.value;
  return out;
}

/** the ENTRY frame: t=kd, from=carl, to=oper-id, data=full tree, hp=map.
    Every attach (a fresh connect AND a V1 reconnect) gets a fresh entry. */
function sendEntry(s: Session): void {
  s.send({ t: 'kd', from: 'carl', to: s.route, data: dataSnapshot(), hp: hpTable() });
}

/** broadcast one kd wave to every session (to = each session's oper id). */
function broadcastWave(from: string, dirty: { [h: string]: LeafValue }): void {
  if (Object.keys(dirty).length === 0) return; // NO no-op waves (silence)
  const f: { [k: string]: unknown } = {
    t: 'kd', from, to: '*', tick: TICK, seq_end: seq, dirty,
  };
  for (const s of sessions.values()) {
    // frame is per-recipient: 'to' names the specific session
    s.send({ t: 'kd', from, to: s.route, tick: f.tick, seq_end: f.seq_end, dirty });
  }
}

/** a tx frame to one session (from/to explicit). */
export function sendTx(s: Session, from: string, kind: string, extra: { [k: string]: unknown } = {}): void {
  s.send({ t: 'tx', from, to: s.route, kind, ...extra });
}

/** the entry's `data` (the full current tree: path->value). */
export function snapshotTree(): { [p: string]: LeafValue } {
  return dataSnapshot();
}

/** the entry's `hp` (int->path, keyed by string handles). */
export function handleTable(): { [h: string]: string } {
  return hpTable();
}

// --- the 60Hz tick (stays; the flush is dirty-only) --------------------------------

let TICK = 0;
let seq = 0; // monotonically increasing (carried as seq_end on kd waves)

function flush(): void {
  TICK += 1;
  const bins = drainDirty();
  if (bins.size === 0) return; // NOTHING changed this tick: SILENCE (no frame)
  for (const [faculty, dirty] of bins) {
    leafClear(dirty);
    seq += 1;
    broadcastWave(faculty, dirty);
  }
}

function leafClear(dirty: { [h: string]: LeafValue }): void {
  for (const h of Object.keys(dirty)) {
    const leaf = leaves.get(Number(h));
    if (leaf) leaf.dirty = false;
  }
}

const iv = setInterval(flush, Math.ceil(1000 / 60));
iv.unref?.();

// --- the selftest sweep (driven by immu; ~3 s; progress changes per write) ---------

const RUNGS = ['dash', 'immu', 'crtx', 'teleg', 'nerv', 'llm1'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * immu's sweep: six named components, each progress 0..100 — the server
 * sleeps between increments (the 60Hz clock is fixed; the DATA changes
 * slower — a progress delta rides a wave only when it actually changes),
 * ~3 s total, distributed per component (randomized). Then mode pass + ms
 * (or mode fault, progress 100, no ms). Concurrent selftests: one at a time
 * (an op while one is active is queued, not run).
 */
export async function runSelftest(): Promise<void> {
  const weights = RUNGS.map(() => 200 + Math.floor(Math.random() * 700));
  const totalw = weights.reduce((a, b) => a + b, 0);
  const windows = weights.map((w) => Math.round(3000 * (w / totalw)));
  for (let i = 0; i < RUNGS.length; i++) {
    const target = RUNGS[i];
    const w = windows[i];
    selftestBegin('immu', target);
    const cost = 0.2 + Math.random() * 2.1; // mock settle cost, ms (one decimal)
    const steps = 12; // the client draws 12 dots: dotField(p) = round(p/100*12)
    for (let k = 1; k <= steps; k++) {
      await sleep(Math.max(2, w / steps - 2));
      selftestProgress('immu', target, Math.round((k / steps) * 100));
    }
    await sleep(20);
    selftestPass('immu', target, cost);
  }
}

// --- boot: the tree IS the wire -------------------------------------------------------

const HEAD = '0.2.0';

export async function bootTree(): Promise<void> {
  booting = true;
  treeSet('carl.version', HEAD);
  for (const s of RUNGS) facultyRegister(s, 'selftest');
  const { carlRomKib, carlProcessMemMib } = await import('./dash/rom.js');
  treeSet('carl.rom', await carlRomKib());          // dist-only, KiB
  treeSet('carl.mem', Math.round(carlProcessMemMib() * 10) / 10); // live RSS (MiB)
  selftestBusy = true;
  await runSelftest();
  selftestBusy = false;
  booting = false;
  for (const s of RUNGS) facultyMode(s, 'service');
  if (selftestQueue.length) {
    selftestBusy = true;
    await runSelftest(); // a queued selftest op (while the boot sweep ran): served now
    selftestBusy = false;
  }
}

// --- the ops (tx kind:'op': data.op, executed by the named faculty) -------------------

/** data.op dispatch. V1: op:'selftest' (run all) — to = immu. While a sweep is
    active, the op is QUEUED (one at a time), not run in parallel. */
export function dispatchOp(s: Session, to: string, data: { [k: string]: unknown }): boolean {
  const op = typeof data?.op === 'string' ? data.op : '';
  if (op === 'selftest' && (to === 'immu' || to === '')) {
    if (selftestBusy || booting) { selftestQueue.push(op); return true; } // rejected/queued
    selftestBusy = true; void runSelftest(); return true;
  }
  return false; // unknown op: not executed (the 202 stays — the wire is live)
}

// --- the mock brain (one turn: crtx mode flip + tx ans chunks + flip back) -----------

export const REPLY_TEXT = "Hello! I'm CARL-01";
let turnOwner: Session | null = null; // one turn at a time (mock)

/**
 * One turn for a session (to = that session — per-client chat routing).
 * crtx active (kd wave, dirty crtx.mode handle) → ANS tx chunks seq 1..N
 * (streamed byte-for-byte, in-order) → crtx service (kd wave).
 */
export async function startTurn(s: Session, userLine: string): Promise<void> {
  if (turnOwner && turnOwner !== s) return; // mock: one turn at a time
  turnOwner = s;
  userLine; // the mock brain is one reply per turn (the prompt is echoed client-side)
  facultyMode('crtx', 'active');
  await sleep(300 + Math.floor(Math.random() * 400)); // the THRU window (kd dirty-only)
  for (let i = 0; i < REPLY_TEXT.length; i += 2) {
    const chunk = REPLY_TEXT.slice(i, i + 2); // 2-byte chunks (mock vLLM rate)
    const n = Math.floor(i / 2) + 1;          // seq = 1,2,3... WITHIN the reply
    sendTx(s, 'crtx', 'ans', { seq: n, text: chunk } as { [k: string]: unknown });
    await sleep(40);
  }
  facultyMode('crtx', 'service');
  turnOwner = null;
}
