// faculties/tree.ts — the CARL-01 v0.1.3 state-tree engine.
//
// The single writer of truth: a dotted-path tree (carl.version,
// carl.faculties.<short>, carl.<driver>.selftest.<short>, carl.rom, carl.mem),
// projected over a FLAT HANDLE table (each leaf = a stable integer handle,
// assigned once at register; a changed handle = a protocol break).
//
// One global 60Hz tick flushes the DIRTY set into one WAVE per subscribed
// client:  wave = { t:'kd', tick, seq_end, dirty:{handle:value} }  —
// coalesced per key (latest value per handle per wave). The ONE hot field
// (a selftest .progress) rides on EVERY wave; every other field is dirty-
// flush. A no-op wave (empty dirty) still advances seq (phase lock across
// silence).
//
// The append-only, never-overwrite, per-seq LOG is the durabiliiyi: it holds
// both the kd waves and the c text chunks (tx tag), seq-ordered, so a
// reconnecting client FOLDS from its last seq_end (never a full re-ship) and
// the tree is a fold of the log. Snapshot-on-connect ships the full table
// once (a dumb client reads it as handles→paths→a tree; the dev client as
// its row map).
//
// ONE stream: the reused GET /sse carries both event types, tagged kd (tree
// wave) and tx (text chunk); the client sorts by tag. c is conversation
// ONLY: zero c during boot — boot is 100% tree (the banner is rendered
// client-side from carl.version + the selftest progress/mode/ms). The mock
// brain (one reply per turn): a THRU window (mode=active), then ANS tx
// chunks drip the reply string byte-for-byte, then a DONE tag.
//
// ROM = on-disk byte-scale size (KiB, 1024) of the RUNTIME SET
// (dist/ + web-ui/build/ + node_modules), memoized at first await.
// MEM = live process RSS (MiB). Both real, both tree values.

import { carlRomKib, carlProcessMemMib } from './dash/rom.js';

type LeafValue = string | number | null;

interface Leaf {
  path: string;      // dotted path (public name)
  value: LeafValue;
  dirty: boolean;    // set on write, cleared on wave flush
  hot: boolean;      // the ONE hot field: selftest progress (every wave)
}

export type TxTag = 'TURN_START' | 'ANS' | 'DONE';

interface Sub {
  session: string;
  tag: string;
  send: (f: unknown) => void;
  cursor: number;    // last seq this client has been given (= its wave seq_end)
  seqEnd: number;    // the previous wave's seq_end (the delta window's floor)
}

interface LogEntry {
  seq: number;
  kind: 'kd' | 'tx';
  dirty?: { [key: string]: LeafValue };
  tag?: TxTag;
  c?: string;
}

// --- flat handle table + dirty flags ------------------------------------------

const leaves = new Map<number, Leaf>();
const handleByPath = new Map<string, number>();
let nextHandle = 1;

function ensureLeaf(path: string): number {
  const found = handleByPath.get(path);
  if (found !== undefined) return found;
  const handle = nextHandle++;
  leaves.set(handle, {
    path,
    value: null,
    dirty: true,
    hot: path.endsWith('.progress'), // the single hot field
  });
  handleByPath.set(path, handle);
  return handle;
}

// --- the log (durabiliiyi) -------------------------------------------------------

const LOG_CAP = 8000;
const log: LogEntry[] = [];
let seq = 0;

function appendLog(e: Omit<LogEntry, 'seq'>): number {
  seq += 1;
  const entry: LogEntry = { ...e, seq };
  log.push(entry);
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  return seq;
}

// --- tree writes ----------------------------------------------------------------

/** write one leaf (value change only: no-change writes are dropped — the
    log is never-overwrite, so a same-value re-write is a protocol no-op). */
export function treeSet(path: string, value: LeafValue): void {
  const handle = ensureLeaf(path);
  const leaf = leaves.get(handle)!;
  if (leaf.value === value) return; // no change: no log entry, no dirty
  leaf.value = value;
  leaf.dirty = true;
  appendLog({ kind: 'kd', dirty: { [handle]: value } });
}

/** register a faculty: PRESENCE of carl.faculties.<short> = registration. */
export function facultyRegister(short: string): void {
  treeSet('carl.faculties.' + short, null);
}

export function selftestBegin(driver: string, target: string): void {
  treeSet('carl.' + driver + '.selftest.' + target + '.mode', 'active');
  treeSet('carl.' + driver + '.selftest.' + target + '.progress', 0);
}

export function selftestProgress(driver: string, target: string, pct: number): void {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  treeSet('carl.' + driver + '.selftest.' + target + '.progress', p);
}

export function selftestEnd(driver: string, target: string, ms: number): void {
  const base = 'carl.' + driver + '.selftest.' + target;
  treeSet(base + '.progress', 100);
  treeSet(base + '.ms', Math.round(ms * 10) / 10);
  treeSet(base + '.mode', 'pass');
}

export function logTxChunk(tag: TxTag, c: string): number {
  return appendLog({ kind: 'tx', tag, c });
}

export function snapshotTree(): { [path: string]: LeafValue } {
  const out: { [path: string]: LeafValue } = {};
  for (const leaf of leaves.values()) out[leaf.path] = leaf.value;
  return out;
}

/** the DEV client's handle→path table (stable; the snapshot's twin; the
    wire's `hp` field is this table keyed by string handles). */
export function pathOf(handle: number): string | undefined {
  for (const [path, h] of handleByPath) if (h === handle) return path;
  return undefined;
}

/** handle→path (flat, for the snapshot frame's hp field). */
function handleTable(): { [handle: string]: string } {
  const out: { [handle: string]: string } = {};
  for (const [path, h] of handleByPath) out[String(h)] = path;
  return out;
}

/** fold of the log after `cursor` — reconnect is a fold, not a re-ship. */
export function fold(cursor: number): { entries: LogEntry[]; snapshot: boolean } {
  if (cursor <= 0) return { entries: [], snapshot: true };
  return { entries: log.filter((e) => e.seq > cursor), snapshot: false };
}

export const treeSeq = (): number => seq;

// --- the 60Hz wave (single global tick) -------------------------------------------

let tick = 0;
const subs = new Map<string, Map<string, Sub>>(); // session → tag → Sub

function sendFrame(s: Sub, f: unknown): void {
  s.send(f);
}

function sendEntry(s: Sub, e: LogEntry): void {
  if (e.kind === 'kd' && e.dirty) {
    sendFrame(s, { t: 'kd', tick, seq_end: e.seq, dirty: e.dirty });
  } else if (e.kind === 'tx' && e.c !== undefined) {
    sendFrame(s, { t: 'tx', seq: e.seq, tag: e.tag, c: e.c });
  }
}

/** attach: a snapshot (first connect: the full folded tree + the
    handle→path table, `hp`) or a fold (warm reconnect: the log tail),
    then live waves — a fold, never a full re-ship. */
export function attach(session: string, tag: string, a: { send: (f: unknown) => void; lastSeq?: number }): Sub {
  let byTag = subs.get(session);
  if (!byTag) { byTag = new Map(); subs.set(session, byTag); }
  const s: Sub = { session, tag, send: a.send, cursor: a.lastSeq ?? 0, seqEnd: a.lastSeq ?? 0 };
  byTag.set(tag, s);

  const f = fold(s.cursor);
  if (f.snapshot) {
    s.send({ t: 'kd', tick, seq_end: seq, snap: snapshotTree(), hp: handleTable() });
  } else {
    for (const e of f.entries) sendEntry(s, e);
  }
  s.cursor = seq;
  return s;
}

export function detach(session: string, tag: string): void {
  subs.get(session)?.delete(tag);
}

function flushWave(): void {
  tick += 1;
  // one WAVE per subscribed client: the DELTA since its last wave — the log's
  // kd entries with seq > (previous seq_end), latest value per key. The hot
  // selftest progress fields carry their CURRENT value on every wave (the
  // client observes them continuously); cold fields ride only when written.
  // A no-op window (no writes) settles to an empty dirty — still a wave,
  // still seq_end+1 (phase lock across silence). The log keeps every seq
  // (durability): the wave is a fold over a window, the tree a fold of the log.
  for (const byTag of subs.values()) {
    for (const s of byTag.values()) {
      const since = s.seqEnd ?? 0;
      // the WAVE = the DELTA since this client's last seq_end: every key
      // written in (since, seq] carries its latest value, coalesced per key
      // (the log keeps all intermediate seqs for durability; the wave folds
      // them). The hot .progress fields ride their writes live (dot-fill is
      // continuous for the client); a settled tree — nothing written — yields
      // an EMPTY dirty, which still advances seq (phase lock across silence).
      const dirty: { [key: string]: LeafValue } = {};
      for (const e of log) {
        if (e.seq <= since || !e.dirty) continue;
        for (const k of Object.keys(e.dirty)) {
          if (!leaves.has(Number(k))) continue;
          dirty[k] = e.dirty[k]; // log is seq-ordered: latest wins
        }
      }
      // the ONE hot field (selftest .progress) rides EVERY wave — its value
      // is re-read from the live tree state, so a no-op window (nothing cold
      // changed) is a phase-locked frame carrying only the hot fields; seq
      // still advances (across silence)
      for (const [h, leaf] of leaves) if (leaf.hot) dirty[String(h)] = leaf.value;
      s.seqEnd = seq;
      s.cursor = seq;
      sendFrame(s, { t: 'kd', tick, seq_end: seq, dirty });
    }
  }
}

const iv = setInterval(flushWave, Math.ceil(1000 / 60));
iv.unref?.();

// --- boot: the state tree is the single writer -------------------------------------

const HEAD = '0.1.3';
const RUNGS = ['dash', 'immu', 'crtx', 'teleg', 'nerv', 'llm1'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Boot self-test: the six named components, each progress 0..100 over
 * ~3 s total (randomized per-component distribution), then mode pass + ms.
 * The client renders 12 dots per rung from progress and 'OK @ X.X ms' from
 * {pass, ms}; the server sends values only. Driver owns run: the sweep runs
 * under carl.<short>.selftest keys (short-shorthand; the client discovers
 * branches by appearance — presence of the key = a new branch).
 */
export async function bootTree(): Promise<void> {
  treeSet('carl.version', HEAD);
  for (const s of RUNGS) facultyRegister(s);

  // ROM (runtime set, KiB) + MEM (RSS) — real values, memoized at first await
  const rom = await carlRomKib();
  treeSet('carl.rom', rom);
  treeSet('carl.mem', carlProcessMemMib());

  // six windows, ~3 s total, distributed per component (randomized)
  const weights = RUNGS.map(() => 200 + Math.floor(Math.random() * 700));
  const totalw = weights.reduce((a, b) => a + b, 0);
  const windows = weights.map((w) => Math.round(3000 * (w / totalw)));

  for (let i = 0; i < RUNGS.length; i++) {
    const target = RUNGS[i];
    const w = windows[i];
    selftestBegin('carl', target);
    const cost = 0.2 + Math.random() * 2.1; // mock settle cost, ms (one decimal)
    const steps = 24; // progress granularity (the client draws 12 dots)
    for (let k = 1; k <= steps; k++) {
      await sleep(Math.max(2, (w / steps) - 4));
      selftestProgress('carl', target, Math.round((k / steps) * 100));
    }
    await sleep(30);
    selftestEnd('carl', target, cost);
  }
}

// --- the mock brain (one reply per turn) --------------------------------------------

export const REPLY_TEXT = "Hello! I'm CARL-01";

/**
 * One turn: THRU window (mode=active → client col-0 spinner from the tree),
 * then ANS tx chunks drip the reply string byte-for-byte (in-order, per-
 * seq, never-overwrite), then DONE. One reply per turn. The USR line stays
 * client-side (frozen on Enter, local — zero c during boot holds).
 */
export async function startTurn(session: string, userLine: string): Promise<void> {
  if (!subs.has(session)) return;
  const byTag = subs.get(session)!;
  const cast = (f: unknown) => { for (const s of byTag.values()) s.send(f); };

  logTxChunk('TURN_START', '');
  cast({ t: 'tx', seq: treeSeq(), tag: 'TURN_START', c: '' });

  // THRU: a short selftest carries the col-0 spinner while active
  const drv = 'nerv';
  selftestBegin(drv, 'nerv');
  const window = 300 + Math.floor(Math.random() * 500);
  const t0 = Date.now();
  for (let k = 1; k <= 10; k++) {
    await sleep(Math.max(2, window / 10 - 4));
    selftestProgress(drv, 'nerv', k * 10);
  }
  selftestEnd(drv, 'nerv', Date.now() - t0);

  // ANS drip: 2-byte chunks (mock vLLM rate), byte-for-byte
  for (let i = 0; i < REPLY_TEXT.length; i += 2) {
    const chunk = REPLY_TEXT.slice(i, i + 2);
    const s = logTxChunk('ANS', chunk);
    cast({ t: 'tx', seq: s, tag: 'ANS', c: chunk });
    await sleep(40);
  }

  const done = logTxChunk('DONE', '');
  cast({ t: 'tx', seq: done, tag: 'DONE', c: '' });
}
