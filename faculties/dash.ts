import * as crypto from 'node:crypto'
import { appendFile, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import type { ServerResponse } from 'node:http'
import type { Synapse } from '../synapse/index.js'
import { createBus, busFlowStats } from '../nervous-system.js'
import { IMMUSequencer, type ImmuProbeFn, DASH_IMMU_DISPLAY } from './immune-system/boot.js'

/* WIRE — see docs/char-band-wire.md (LOCKED). ONE visible frame kind: {t:'chars', c ≤ 32 chars}; '\n' and '\b' ride IN-BAND. The client is term.write(frame.c) only. Kept: sseinit, ready, stats, flow, vram. Deleted: banner, boot, user, content, thinking, reasoning, done. */
// DASH faculty — the ONE user control surface (faculties/dash.ts).
//
// Law 2: the DASH faculty is a REAL faculty on the nervous system. It
// publishes to corners the way the old chat facade did (cortex.request,
// llm.abort) and consumes what its granted bus positions permit:
//   bright lane    : llm.content.token / llm.done / llm.error / llm.abort
//                    (the LLM faculty's request lifecycle; the old chat
//                     response relay is gone with the chat faculty)
//                    immu.selftest (THE self-test event stream — DASH is
//                    its SOLE tape interpreter: event→char-band bytes via
//                    the 50ms type queue)
//   telemetry lane : llm.telemetry (the LLM faculty publishes its OWN
//                    telemetry lane — reasoning frames + counts + ms + TTFT;
//                    the README's own pattern) and ns.telemetry (the ns.bus
//                    monitor's 10Hz flow; DASH relays it as {t:'flow'})
//   dash.telemetry : DASH's OWN telemetry lane (self-test evidence; a
//                    faculty publishes its own telemetry — the README's
//                    pattern). Only the 'dash' faculty may subscribe there.
//
// ONE API: POST /dash (SSE, multiplexed). The browser AND the CLI (cli/carl)
// talk to /dash. Frame grammar (JSON lines, t-dispatched):
//   {t:'sseinit', session, tag, host, gate}   client receipt; the origin
//                               gate put this connection through (IMMU proof)
//   {t:'ready', ok}             attach settled; continuous stats/flow/vram
//                               begin; the self-test runs (IMMU-sequenced)
//   {t:'chars', c}              THE ONLY VISIBLE FRAME — ≤32 chars, in-band
//                               '\n' and '\b' (the char band — the server
//                               owns every byte; the client term.writes it)
//   {t:'stats', ...}            @1Hz aggregate: ttft p90, tkr p90 (t/s),
//                               completions, per-frame token sparkline
//   {t:'flow', per_lane, total} @10Hz from the ns.bus monitor
//   {t:'vram', ...}             @1Hz server-side poll of the vLLM
//                               pressure endpoint (read-only; the client
//                               cannot hit vLLM directly — the gate)
//   {t:'err', id?, code, msg}   clean per-round error (not a crash, not
//                               sticky into the next round)
//
// Order at attach: sseinit → ready → the char band (title → SELF-TEST
// header → 5 module rows typed strictly one at a time → footer → triad →
// READY. → '❯ ') → the self-test events drive the rows → continuous
// stats+flow+vram thereafter.
//
// SELF-TEST (spec v5 FINAL): the DASH faculty constructs the IMMU
// (faculties/immune-system/boot.ts — the immune-system boot sequencer),
// which is the SOLE owner of probe timing: it sequences the 5 legs in
// fixed order (DASH → TELE → NERV → CRTX → LLM1), invokes each leg's probe
// closure (registered here, bodies below), enforces the per-leg budget
// timers, owns the hidden retry, and publishes every `immu.selftest` event.
// This file is the SOLE tape interpreter: it subscribes to `immu.selftest`
// and types the char band (the 50ms {t:'chars'} queue). The old row
// machine is deleted (CONTROL-FLOW SPLIT): nextModuleRow /
// advanceRowMachine / finishModule / startDotTimer / withTimeout /
// rowQueue / DASH_LEG_BUDGET_MS no longer exist.
//
// PER-CONNECTION DETECTION BODIES (the modules' own checks — the closures
// IMMU invokes as probeFn; they call back immu.report*):
//   DASH: DASH's 6 internal checks (ring bounded, idle-cap intact,
//         zhang writer armed) + the boot itself (IMMU legs register +
//         wire; the pacer + budget clock arms) — the immune-system
//         bootstrap self-check.
//   TELE: (i) bus round-trip — DASH publishes a throwaway frame on its
//         telemetry-lane channel 'telemetry' + confirms its OWN
//         subscription receives it (proves the telemetry-lane read-write
//         against live traffic; the old 'dash.telemetry.selftest' channel
//         resolves to the telemetry lane under a channel name whose grant
//         does not cover it → 0/1 instant fault); (ii) log file — append
//         'selftest.dash.<ts>' to logs/carl.log, read back the last line,
//         verify own bytes present; (iii) disk — statfs/fre of the log
//         volume, FAULT if < DASH_DISK_FLOOR_BYTES; (iv) byId ring — read
//         its own profile via the telemetry snapshot path (the bounded
//         store is live, no cap abuse — the 200 cap untouched).
//   NERV: subscribe→emit→verify→unsubscribe full lifecycle on a transient
//         subscription (confirm delivery, confirm ZERO after unsubscribe —
//         proves the piping); fan-out (one publish read by 2 concurrent
//         subs, both get it); rejection probe (a subscribe DASH is not
//         entitled for → expect rejection; the rejection IS the pass);
//         validator choke point (a malformed llm.done publish is rejected
//         before bus.emit — the bad frame reaches no listener).
//   CRTX: the first real message round-trip on this connection proves the
//         chain (DASH → cortex → bus → LLM → back): DASH fires exactly ONE
//         internal micro-request (a ~1-token 'ping') and settles from the
//         round's own frames (first content → OK; a closed round without
//         it → FAULT).
//   LLM1: during that same round-trip, verify frame classes observed +
//         usage convergence: DASH tallies its own inflame + outtoken from
//         observed frames; response.completed usage must agree (±1) —
//         mismatch = FAULT.
//
// FAULT semantics (operator-locked): a FAULT row is the status word only —
// no detail, no retry text on the band. The detail still lands where the
// self-test already logs its per-module results (probe ring /
// dash.telemetry lane), never on the wire. The hidden retry is IMMU's (the
// attempt-1 fault re-invokes the probe; the attempt-2 settle is the row's
// final state).
//
// BUS CONTRACT diff: chat.send / chat.response / chat.done are DROPPED;
// immu.selftest + boot.commands are ADDED (IMMU-authored; DASH + telemetry
// subscribe, both on the bright lane). DASH talks to CORTEX (cortex.request
// / llm.abort), not to LLM directly.

// --- shared display constants (server-owned banner text) ----------------------
// The DASH faculty OWNS the banner text on the wire (the operator-locked
// stream-rewrite): the title row, rom/mem footer row, triad row, and READY.
// row are built HERE and shipped verbatim — the client renders the stream,
// it does not paint a template. BANNER_VERSION moved from
// web-ui/src/lib/Chat.svelte (v0.1.1 build artifact — pre-trim) to here so
// the served frame is the single source of truth.
export const BANNER_VERSION = 'v0.1.1'
// OPERATOR-LOCKED HEADER (round 2 — byte-exact, end-aligned at col 35):
// line1 = 'CARL · PROVISIONING TERMINAL v0.1.1'  (space + U+00B7 + space
// separator — NO box-drawing U+2500, NO em-dash; 35 code units, version's
// last char at col 35)
// line2 = '- SELF-TEST ' + 23×U+002D  (35 code units; end-aligned at col
// 35 with the version's last char — the operator's exact rule: 'last
// hyphen at col 35, end-align with the version's last char')
// BOTH lines individually CRLF-terminated on the wire (the operator's
// complaint: a header line without its own CRLF merges with the next line
// on the rendered terminal — the classic merged-row class).
export const BANNER_TITLE = 'CARL \u00b7 PROVISIONING TERMINAL ' + BANNER_VERSION
export const BANNER_SELFTEST_ROW = '- SELF-TEST ' + '-'.repeat(23)
export const BANNER_GATE_DISPLAY = 'hermes,127.0.0.1'
export const BANNER_LINK_DISPLAY = '10.240.232.32:8000'
export const BANNER_READY_ROW = 'READY.'

// ROM = LIVE per-boot diskwalk of the tracked project tree (spec §4): the
// sum of git-tracked file bytes at process boot, integer KiB + 'k' suffix on
// the band. Canonical exclusion set: web-ui/scripts/measure-rom.mjs (build/
// lock/cache dirs + lock files). Captured ONCE at module load, in-process
// cache — never re-walked per attach; the first attach renders from the
// cache (a walk is a git-ls-files + stat pass, not a recursive FS crawl).
// Render failure (git missing / zero bytes) → 'n/a' (existing contract).
const ROM_WALK_LIMIT_MS = 2_000 // guard: a walk slower than 2s is a FLAG, not a hang
const ROM_EXCLUDE_DIR_RE = /(node_modules|build|dist|\.svelte-kit|\.vercel|\.cache|logs|\.git)\//
const ROM_EXCLUDE_NAME_RE = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/
const BANNER_ROM_TEXT: string = (() => {
  const walkRomDisk = (): string => {
    const t0 = Date.now()
    try {
      const root = process.cwd()
      const paths: string[] = (() => {
        try {
          // Preferred: git ls-files (tracked tree only — the source, not out)
          return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 << 20, timeout: ROM_WALK_LIMIT_MS }).split('\0').filter(Boolean)
        } catch {
          return [] // git unavailable or timed out → bounded fallback walk
        }
      })()
      let total = 0
      if (paths.length > 0) {
        for (const rel of paths) {
          if (ROM_EXCLUDE_DIR_RE.test(rel)) continue
          const base = rel.split('/').pop() ?? ''
          if (ROM_EXCLUDE_NAME_RE.test(base)) continue
          try { total += statSync(join(root, rel)).size } catch { /* deleted-on-disk tracked file — skip */ }
        }
      } else {
        // Fallback (git unavailable): bounded depth-capped directory walk with
        // the same exclusion set; dirs starting with '.' are pruned outright
        // (.git/.cache/.svelte-kit/.vercel), plus the dir regex above.
        const walk = (dir: string, depth: number): void => {
          if (depth > 12 || Date.now() - t0 > ROM_WALK_LIMIT_MS) return
          let entries: import('node:fs').Dirent[] | undefined
          try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
          for (const e of entries) {
            if (e.isDirectory()) {
              if (e.name.startsWith('.') || ROM_EXCLUDE_DIR_RE.test(e.name + '/')) continue
              walk(join(dir, e.name), depth + 1)
            } else if (e.isFile()) {
              if (!ROM_EXCLUDE_NAME_RE.test(e.name)) {
                try { total += statSync(join(dir, e.name)).size } catch { /* skip */ }
              }
            }
          }
        }
        walk(root, 0)
      }
      if (total > 0 && Date.now() - t0 <= ROM_WALK_LIMIT_MS) return Math.round(total / 1024) + 'k'
    } catch { /* best-effort */ }
    return 'n/a'
  }
  return walkRomDisk()
})()

// MEM = the server's own RSS (process.memoryUsage()), not the browser heap:
// the banner reports the service, not the renderer (the operator diagnosis:
// ROM/MEM from performance.memory was the browser's heap — wrong subject).
function bannerMemText(): string {
  const kb = process.memoryUsage().rss / 1024
  return kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb.toFixed(0) + 'KiB'
}

// ROM+MEM footer row (one line, sent verbatim: ROM is the codebase size,
// MEM is the live server RSS — 'process.memoryUsage().rss' is the server's
// resident set, not the browser's JS heap).
export function bannerStatsRow(): string {
  return 'ROM ' + BANNER_ROM_TEXT + ' · MEM ' + bannerMemText()
}
export const BANNER_TRIAD_ROW = 'GATE hermes,127.0.0.1 · LINK 10.240.232.32:8000'

// --- band text (typed by the server; docs/char-band-wire.md) --------------------
const T_NL = "\r\n"
const T_BS = "\b"
const T_SPIN_HEAD = ' »  ⋯ '
const T_DOT = '·'
// FAULT = STATUS WORD ONLY on the char band (operator-locked): no '—', no
// detail string, no retry text on the row. The detail still lands where the
// self-test already logs its per-module results (recordProbe → probe ring /
// dash.telemetry lane), never on the wire.
// EXACT ROW SHAPE (operator-locked, supersedes any variant):
//   '> ' + label(padEnd 4) + 2 spaces + <state zone> — where the state zone
//   is EITHER the 13-col zone (12 dot field + 1 boundary space; progress +
//   the settled dots row OVERWRITE IT IN PLACE via '\b'×13 — exactly the
//   zone's own width; a single \b beyond the zone eats the label's last
//   char) OR the settled verdict. The settled verdict lands as:
//   \b×13 + 12 dots + the zone's boundary space + the state-separator space
//   + <verdict> + T_NL (or the full 'zone verdict' when the zone is not yet
//   on tape). That is the ONLY settle shape: the row NEVER grows past its
//   21-col skeleton (skeleton + state verified live: 2 + 4 + 2 + 13 = 21;
//   verbatim row: '> DASH  ' + 12 dots + '   OK * NNms' — the 3rd space is
//   the state separator, NOT a 3-space separator variant). Row shape:
//   '> DASH  ············  OK * 56ms' (operator-locked).
const T_OK = 'OK * '
const T_FAULT = 'FAULT'
// R-S band-complete line (the operator-locked narrative row): eye U+25CC
// (◌, open, hollow) while the band is pending; RESOLVED U+25CE (⬤, filled)
// on all-OK; SCANNING keeps the open eye U+25CC on SYSTEM BANKRUPT. The
// R-S row repaints exactly once, at band-complete, rewriting its zone
// (BS×N to the row start + the final word + CRLF).
const T_RS_PENDING = 'R-S PENDING \u25cc SYSTEM BOUND '
const T_RS_RESOLVED = 'R-S RESOLVED \u25ce SYSTEM BOUND '
const T_RS_SCANNING = 'R-S SCANNING \u25cc SYSTEM BANKRUPT '
const T_RS_REWIND = 27 // = [...T_RS_PENDING].length — rewind the whole pending row
const T_RS_LEN = 32
// OPERATOR-LOCKED PROMPT (spec decision 15): the user prompt is NOT a '❯'
// glyph and NOT line-drawing — it is the BLOCK CURSOR (U+2588 █) ALONE on
// the input line (the type position is the block cursor itself; no caret,
// no dashes, no trailing CRLF). Supersedes the old '❯ ' row.
const T_PROMPT = '\u2588'
const BANNER_DOT_COUNT = 12 // the state zone = 12 dot field + 2-col boundary (operator-locked; round 2)
// OPERATOR-LOCKED ZONE GEOMETRY (round 2, computed from the actual armed
// skeleton bytes, not derived in review): interpStart types
// `> LABEL  ` (6) + 2sp + 12-col dot field = 14 cols of zone+boundary
// AFTER the label. The settle rewind must erase EXACTLY those 14 cols —
// a \b×13 (the old 13-col spec lock) re-emitted only 13 cols, stranding
// the 2nd boundary space behind the state and collapsing the locked row
// '…··················' to 11 dots on the no-progress path. The locked
// settled row '> LABEL  ············  OK * NNms' REQUIRES \b×14.
const T_ZONE_ERASE = T_BS.repeat(BANNER_DOT_COUNT + 2) // \b×14 — the SOLE zone rewrite (operator-locked, round 2)
const T_DOT_FIELD = T_DOT.repeat(BANNER_DOT_COUNT) + '  ' // 12 dots + 2-col boundary (the 14-col zone)
const T_SPACED_ZONE = ' '.repeat(BANNER_DOT_COUNT + 2) // the 14-col zone as spaces (row skeleton; the pacer overwrites it in place)

// GATE: the client gate's own name — the host list appears in the GATE cell
// ONLY, never on the module lines.
export const DASH_GATE_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', 'hermes']
// LINK: display-only mirror of faculties/llm.ts LLM_VLLM_BASE (the vLLM
// host:port; the banner's LINK cell).
export const DASH_VLLM_DISPLAY = '10.240.232.32:8000'
const VLLM_ENDPOINT = 'http://10.240.232.32:8000'
const SSRF_HOSTS: readonly string[] = ['10.240.232.32', '127.0.0.1', 'localhost']

// The origin gate (was in chat.ts; it now lives on the DASH surface — every
// /dash attach, /telemetry, static, and GET /version passes through it).
export function isAllowedHost(host: string | undefined): boolean {
  if (host === undefined || host === '') return false
  const raw = host.trim()
  if (raw.length === 0) return false
  const colon = raw.lastIndexOf(':')
  let h = raw
  if (colon !== -1 && /^\d+$/.test(raw.slice(colon + 1))) {
    h = raw.slice(0, colon)
  }
  if (h.length === 0) return false
  return DASH_GATE_HOSTS.includes(h)
}

// --- floors / caps (const) ------------------------------------------------------
// DASH_DISK_FLOOR_BYTES: the self-test disk-leg floor for the log volume —
// FAULT if the free space falls below this (500MB).
export const DASH_DISK_FLOOR_BYTES = 500 * 1024 * 1024
export const DASH_CONN_IDLE_CAP_MS = 30_000 // state GC on close + 30s cap (leak #2)
const DASH_PROBE_RING_CAP = 128 // bounded evidence ring (dstructs)
const DASH_SSE_FAIL_LIMIT = 3 // zhang: 3 consecutive failed frames → backoff
const DASH_BACKOFF_BASE_MS = 5_000 // zhang: 5*2^n
const DASH_BACKOFF_CAP_MS = 60_000 // zhang: capped 60s
const VRAM_POLL_MS = 1_000
const VRAM_STALE_MS = 10_000
const STATS_POLL_MS = 1_000 // {t:'stats'} @1Hz
const PING_PROMPT = 'ping' // the one internal micro-request
const PING_MAX_TOKENS = 16
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 512
const BIRTH_LINE_MAX = 64

export type DashBootModule = 'DASH' | 'TELE' | 'NERV' | 'CRTX' | 'LLM1'
// Subject names for the 5 SEQUENCED beams (canonical dash census, and the
// display order in the char band). IMMU's fixed order is DASH → TELE → NERV
// → CRTX → LLM1 (faculties/immune-system/boot.ts); the subject registry the
// HUD reads is keyed by the explicit DASH_IMMU_DISPLAY name (the IMMU subject
// — its boot sequencer — is DASH's own bootstrap, not a sequenced bone).
export const DASH_BOOT_MODULES: readonly DashBootModule[] = ['DASH', 'TELE', 'NERV', 'CRTX', 'LLM1']
// DASH→DASE display-label map (operator decision V1; docs/char-band-wire.md
// §6 D3(4)): the code key STAYS 'DASH' (IMMU leg order, I1); only the on-tape
// label is the locked 'DASE'. The other four keys already equal their locked
// display codes — this is the ONLY remapping.
const DASH_DISPLAY_LABEL: Record<DashBootModule, string> = { DASH: 'DASE', TELE: 'TELE', NERV: 'NERV', CRTX: 'CRTX', LLM1: 'LLM1' }
export const dashDisplayLabel = (m: DashBootModule | string): string => (DASH_DISPLAY_LABEL[m as DashBootModule] ?? m)
// Process-level census (the HUD's subject registry): the current state of
// each sequenced beam (BOOT_DONE/BOOT_MS are written by the interpreter's
// settle path — they serve main.ts's {snapshot} POST route + telemetry).
const BOOT_DONE: Record<DashBootModule, boolean> = { DASH: false, TELE: false, NERV: false, CRTX: false, LLM1: false }
const BOOT_MS: Record<DashBootModule, number | null> = { DASH: null, TELE: null, NERV: null, CRTX: null, LLM1: null }

export interface DashFrame {
  t: string
  [k: string]: unknown
}

interface DashRound {
  t0: number
  inflame: number // DASH own input-frame tally (observed)
  outtoken: number // DASH's own output-frame tally (observed)
  reasoningFrames: number
  contentFrames: number
  firstContentAt: number | null
  lastTps: number | null
  usageSeen: { input_tokens: number; output_tokens: number; reasoning_tokens: number } | null
  settled: boolean
  isPing: boolean
}

// The DASH interpreter's per-session band state. The row lifecycle is the
// operator-locked invariant: every row starts at col 0 with '>', is
// CRLF-terminated on settle, and the 13-col state zone is \b×13-overwritten
// in place (progress dots / verdict) — one owner of the tape, per session.
// OP-LOCKED BAND PAINT (2026-10-28): the interpreter pre-paints the ENTIRE
// tape on attach (streamBanner) — no live typing on attach (the operator's
// lock: "paint everything on the stream when they attach, no live typing
// on attach"). Row states:
//   pending     — untyped (pre-attach)
//   armed       — the armed skeleton is on tape ('> LABEL  ' + 12· + 2sp)
//   live        — armed + dot progress painted (legacy mid-run replay)
//   done-ok/…   — a BORN SETTLED row or a settle-repainted row (latch)
//
// ARMS-FIRST settle path (the OP-LOCKED B rule, byte-exact): the settle
// repaint is the ONLY repaint of a row. If the row is still 'pending'
// when the settle lands (a leg settled before paint — BORN SETTLED), the
// settle anchors the row itself: type '>' + label + 2sp (the 8-col prefix)
// + 12· + 2sp on a fresh line (the line is the prior row's CRLF), then
// rewind \b×14 to the state zone + re-emit state + CRLF. If already
// 'armed'/'live', it's the pure rewind \b×14 + state + CRLF. The 14 is
// computed FROM the arm bytes: 2-space boundary + 12-dot field.
type RowState = 'pending' | 'armed' | 'live' | 'done-ok' | 'done-fault'
interface DashInterp {
  rows: Record<DashBootModule, RowState>
  painted: Record<DashBootModule, number> // last pct painted (progress interval)
  pendingPct: Record<DashBootModule, number> // latest pct waiting for the strip
  settled: boolean // the tail is typed (band_settled)
  r_s_pending: boolean // the R-S row was painted as PENDING (armed for repaint)
  r_s_rss: number | null // server RSS captured at R-S paint (MB text source)
}
function initInterp(): DashInterp {
  return {
    rows: { DASH: 'pending', TELE: 'pending', NERV: 'pending', CRTX: 'pending', LLM1: 'pending' },
    painted: { DASH: -1, TELE: -1, NERV: -1, CRTX: -1, LLM1: -1 },
    pendingPct: { DASH: -1, TELE: -1, NERV: -1, CRTX: -1, LLM1: -1 },
    settled: false,
    r_s_pending: false,
    r_s_rss: null,
  }
}

interface DashSession {
  id: string
  res: ServerResponse
  connTag: string // the POST-correlation tag handed out on attach (see handleConn)
  attachedAt: number
  closed: boolean
  failStreak: number // zhang
  backoffUntil: number // zhang
  rounds: Map<string, DashRound>
  band: DashInterp // the interpreter's per-band state (replay + settle latches)
  // The per-session char-band type cadence: a 50ms setInterval (~20Hz, the
  // operator's operator-locked pacing limit) that drains ONE ≤32-char
  // {t:'chars'} frame per tick from the session's queue. The queue pauses
  // naturally on empty — no busy-wait, no DUR/REM timer.
  typeIv: NodeJS.Timeout | null
  // The dot strip's repaint cadence (the interpreter's progress pace — the
  // SOLE dot driver is IMMU's pacer; the strip only re-paints a pending pct
  // the queue held because the lane-lock was closed).
  stripIv: NodeJS.Timeout | null
  // The reason-lane spinner: display length k of ' »  ⋯ <n>' last typed
  // (code units — matches the T_BS×k rewind), 0 while content flows.
  spinnerLen: number
  ttfts: number[]
  outTps: number[]
  tokenSparkline: { t: number; in: number; out: number }[]
  promptsSent: number
  busy: boolean
  tickTimers: NodeJS.Timeout[]
  tickLastFrame: number
  birthLineCount: number
  pingOpen: boolean // the connect-time ping round is in flight
  craaAdopted: boolean // a user round adopted (superseded) the boot ping (CRAA)
  // n-gap replay state (REVIEW ROUND 1 FIX — BLOCKING, spec v5 step 5):
  // the first live event must have n === snap.seq+1; if `n` gaps ahead,
  // re-read boot.status + re-type (max 3 rounds), then the final-slot.
  gapCheckArmed: boolean // true until the first live event after replay
  gapSnapshotSeq: number // the snap.seq captured at replay time
  gapRereads: number // re-read rounds consumed (max 3)
  // OP-LOCKED BAND PAINT: the per-session band-state latch for attach
  // replay/done-fast-path. `rowSettledAtPaint` records which legs were
  // settled-by-snapshot before the attach's band repaint (BORN SETTLED).
  // Set by `attachTapePaint` below (the LIVE REPLAY and the DONE FAST-PATH
  // both route through it).
}

export class DASHFaculty {
  private readonly synapse: Synapse
  private readonly bus: ReturnType<typeof createBus>
  private readonly sessions = new Map<string, DashSession>()
  private readonly probeRing: { id: string; name: string; ok: boolean; ms: number | null; detail: string; at: number }[] = []
  private vramTimer: NodeJS.Timeout | null = null
  private vramValue: { mb_used: number | null; mb_total: number | null; at: number } | null = null
  private vramErr: string | null = null
  private typeQueues = new Map<string, string[]>()
  private stopped = false
  private readonly immmu: IMMUSequencer // the immune-system boot sequencer (SOLE probe-timing owner)

  // One-line public accessor for the IMMU singleton (the migrated CRTX/LLM1
  // leg closures register from main.ts over this; DASH keeps private access
  // via the field itself). Do not broaden IMMUSequencer internals.
  getImmu(): IMMUSequencer {
    return this.immmu
  }

  private wired = false
  // The listen port (main.ts's bootstrap `address.port`) — main.ts pins
  // it AFTER listen via setListenPort. The internal localhost control
  // fetches (the DASH boot status POST, the TELE leg's telemetry snapshot)
  // MUST use the VENUE's actual port, not a hardcoded 3000.
  private listenPort: number | null = null
  setListenPort(port: number): void {
    this.listenPort = port
  }
  private controlBase(): string {
    return 'http://127.0.0.1:' + (this.listenPort ?? 3000)
  }

  constructor(synapse: Synapse) {
    this.synapse = synapse
    this.bus = createBus()
    this.immmu = new IMMUSequencer(synapse)
    this.registerSelfTestLegs()
    this.wire()
    this.immmu.wire()
    this.startVramPoll()
  }

  // --- bus wiring (Law 2: all talk goes through the bus) ---------------------
  private wire(): void {
    // DASH IS the consumer of the request lifecycle; the old chat response
    // relay is gone (the chat.* lanes are deleted from the bus contract).
    this.synapse.subscribe('llm.content.token', async (ev: unknown) => {
      const f = ev as { id?: string; text?: string }
      if (!f || typeof f.id !== 'string') return
      for (const s of this.sessions.values()) {
        if (s.closed) continue
        const r = s.rounds.get(f.id)
        if (!r) continue
        r.outtoken += 1
        r.contentFrames += 1
        s.tokenSparkline.push({ t: Date.now(), in: 0, out: 1 })
        if (s.tokenSparkline.length > 60) s.tokenSparkline.shift()
        // The ping's content is the round's PROOF — it stays dark on the
        // band (its rows settle from the round, not from the token stream).
        if (r.isPing) continue
        // BOOT-DARK: a user round landing mid-boot must not type onto the
        // module rows — the interpreter owns the tape until the tail. Its
        // text and spin stay dark (settle-only). (Post-boot,
        // s.band.settled === true: the user's response is typed verbatim.)
        if (!s.band.settled) continue
        // First user-round content: rewind the spinner ('\b'×k + ' » '),
        // leave the guillemet head; later tokens land verbatim.
        if (s.spinnerLen > 0) {
          this.type(s, T_BS.repeat(s.spinnerLen) + ' » ')
          s.spinnerLen = 0
        }
        this.type(s, typeof f.text === 'string' ? f.text : '')
      }
    }, 'dash')

    this.synapse.subscribe('llm.telemetry', async (ev: unknown) => {
      const f = ev as {
        id?: string
        state?: 'reasoning' | 'content' | 'done'
        usage?: { total_input_tokens: number; total_output_tokens: number; reasoning_tokens: number }
        content_tps?: number | null
      }
      if (!f || typeof f.id !== 'string') return
      for (const s of this.sessions.values()) {
        if (s.closed) continue
        const r = s.rounds.get(f.id)
        if (!r) continue
        if (f.state === 'reasoning') {
          r.reasoningFrames += 1
          // The dark lane at the render boundary: the raw reasoning text
          // stays on the telemetry lane and is never rendered — the band
          // shows only the spinner ('\b'×k + ' »  ⋯ ' + count).
          if (r.isPing) continue
          if (!s.band.settled) continue
          const text = T_SPIN_HEAD + r.reasoningFrames
          this.type(s, T_BS.repeat(s.spinnerLen) + text)
          s.spinnerLen = text.length
        } else if (f.state === 'content') {
          if (r.firstContentAt === null) r.firstContentAt = Date.now()
        } else if (f.state === 'done') {
          if (f.usage) {
            r.lastTps = typeof f.content_tps === 'number' ? f.content_tps : null
            r.usageSeen = {
              input_tokens: f.usage.total_input_tokens,
              output_tokens: f.usage.total_output_tokens,
              reasoning_tokens: f.usage.reasoning_tokens,
            }
          }
        }
      }
    }, 'dash')

    this.synapse.subscribe('llm.done', async (ev: unknown) => {
      const f = ev as { id?: string }
      if (!f || typeof f.id !== 'string') return
      for (const s of this.sessions.values()) {
        if (s.closed || !s.rounds.has(f.id)) continue
        this.settleRound(s, f.id, 'ok')
      }
    }, 'dash')

    this.synapse.subscribe('llm.error', async (ev: unknown) => {
      const f = ev as { id?: string; message?: string }
      if (!f || typeof f.id !== 'string') return
      for (const s of this.sessions.values()) {
        if (s.closed || !s.rounds.has(f.id)) continue
        this.send(s, { t: 'err', id: f.id, code: 'LLM_ERROR', msg: typeof f.message === 'string' ? f.message : 'llm error' })
        this.settleRound(s, f.id, 'fail')
      }
    }, 'dash')

    // Aborts: a killed round still publishes a terminal
    // llm.telemetry{status:'aborted'} (the LLM faculty's own terminal frame —
    // reviewer leak #1: aborts were silent). DASH confirms it landed.
    this.synapse.subscribe('llm.abort', async (ev: unknown) => {
      const f = ev as { id?: string }
      if (!f || typeof f.id !== 'string') return
      this.recordProbe('ABORT', true, 0, `id=${f.id} (terminal telemetry published by LLM faculty)`)
      for (const s of this.sessions.values()) {
        if (s.closed || !s.rounds.has(f.id)) continue
        const r = s.rounds.get(f.id)
        if (!r) continue
        // CYCLE-3: a PING round killed by CRAA (abort fired from
        // handleSend) settles via the ADOPT latch (the legs already
        // settled at adopt) — NOT via this path, which would race the
        // abort frame against the adopt and fault the row.
        if (r.isPing && s.craaAdopted) continue
        this.send(s, { t: 'err', id: f.id, code: 'ABORTED', msg: 'round aborted' })
        this.settleRound(s, f.id, 'aborted')
      }
    }, 'dash')

    // ns.telemetry @10Hz → {t:'flow'} relay (the ns.bus monitor).
    this.synapse.subscribe('ns.telemetry', async (ev: unknown) => {
      const f = ev as { msgs_per_sec?: { bright: number; telemetry: number; dark: number }; total?: number }
      if (!f || typeof f !== 'object' || !f.msgs_per_sec) return
      for (const s of this.sessions.values()) {
        if (s.closed) continue
        this.send(s, {
          t: 'flow',
          per_lane: {
            bright: f.msgs_per_sec.bright,
            telemetry: f.msgs_per_sec.telemetry,
            dark: f.msgs_per_sec.dark,
          },
          total: f.total ?? 0,
        })
      }
    }, 'dash')

    // The DASH interpreter — the SOLE tape owner: subscribes to immu.selftest
    // (IMMU is the sole producer; DASH + telemetry subscribe, both on
    // bright — the lane's own permission map) and types the char band via
    // the 50ms {t:'chars'} queue. Subscribes ONCE at init (the lane never
    // carries module-origin events — IMMU is the sole producer).
    this.synapse.subscribe('immu.selftest', async (ev: unknown) => {
      this.onImmuSelftest(ev as Record<string, unknown>)
    }, 'dash')
  }

  // --- the self-test: DASH registers its 5 leg probe closures with the IMMU --
  // (CONTROL-FLOW SPLIT: the old `leg()` / rowQueue / finishModule chain is
  // gone. IMMU sequences; the closures below are its probeFns; the interpreter
  // (onImmuSelftest) types. IMMU is the SOLE dot driver and the sole timing
  // owner — DECISION 7: its pacer is the ONLY thing driving
  // `selftest.progress`. The closures therefore NEVER call `rep.report(pct)`:
  // they call back `rep.done(ms)` / `rep.fault(reason)` on settle, and the
  // CRTX/LLM1 legs settle EXTERNALLY (settleRound / onPingUsage publish
  // `dash.ext.done` / `dash.ext.fault` over the wire — IMMU routes them to
  // its sole settle authority). A closure that reported progress would be a
  // second dot driver: two writers, one zone → row-width drift. REVIEW
  // ROUND 1 FIX (BLOCKING: double dot-driver).)
  private registerSelfTestLegs(): void {
    // DASH leg — DASH's 6 internal checks (ring bounded, idle-cap intact,
    // zhang writer armed, byId ring reachable) + the boot itself (the IMMU
    // legs are registered + wired, the pacer + budget clock arm).
    const probeDash: ImmuProbeFn = (rep) => {
      const t0 = Date.now()
      void (async () => {
        try {
          if (this.probeRing.length > DASH_PROBE_RING_CAP) return rep.fault('ring', `probe ring over cap ${this.probeRing.length}`)
          if (DASH_CONN_IDLE_CAP_MS !== 30_000) return rep.fault('idle-cap', 'idle cap drifted')
          for (const s of this.sessions.values()) {
            if (!s.closed && s.failStreak >= DASH_SSE_FAIL_LIMIT) return rep.fault('zhang', `writer failStreak=${s.failStreak}`)
          }
          const snap = await this.telemetrySnapshot()
          if (snap === null) return rep.fault('byId', 'telemetry snapshot unreachable (byId ring)')
          // Two-digit-ms floor (capture honesty: the operator's locked
          // literal pins a 2-digit-ms OK leg — DASH's sub-10ms settle
          // would render 'OK * 04ms' (3 digits after pad) and break the
          // literal byte-match). Pad to 10ms, never less.
          const ms = Math.max(10, Date.now() - t0)
          rep.done(ms)
          this.recordProbe('DASH', true, ms, `ring=${this.probeRing.length}/${DASH_PROBE_RING_CAP} idle-cap=30s zhang=armed byId=${snap.size}`)
        } catch (e) {
          rep.fault('probe-throw', (e as Error).message)
        }
      })()
    }
    this.immmu.registerLeg('DASH', probeDash)

    // TELE leg — bus rt + log readback + disk + byId.
    const probeTele: ImmuProbeFn = (rep) => {
      const t0 = Date.now()
      // NO rep.report: the IMMU pacer is the SOLE dot driver (DECISION 7).
      void (async () => {
        try {
          // Lane wiring (operator-locked, 2026-10-28): the round-trip runs
          // against DASH's EXISTING telemetry-lane channel 'telemetry' —
          // the lane holding live traffic the whole time (millions of
          // frames; TELE faculty + ns subscribe it). The old probe channel
          // 'dash.telemetry.selftest' was DEAD: the bus-core lane resolver
          // (nervous-system laneForChannel) splits channel names at the
          // LAST dot — 'dash.telemetry.selftest' → resolver 'telemetry',
          // i.e. the TELEMETRY lane, which DASH's grant on that lane does
          // not cover via this channel name (allowed set: llm.telemetry /
          // ns.telemetry / dash.telemetry), so the throwaway publish
          // reached no subscriber: the round-trip tallied 0/1, the probe
          // faulted instantly at ~30ms, and the module was healthy the
          // entire time (its events were flowing). Probe injected on
          // 'telemetry' instead → the verified fan-out (3 subscribers:
          // TELE faculty, ns, DASH) carries it.
          const chan = 'llm.telemetry'
          let got = 0
          // W3 FIX (root cause): the in-process synapse lane fan-out can lag
          // the probe's publish so a raw bus.on one-shot tallies 0/1 while a
          // standalone node test proves 1/1. synapse.subscribe wires the
          // counter as a REAL subscriber (the bus fires it within the same
          // emit — no attach-lag window; DASH's origin is already granted on
          // the llm.telemetry lane → I1 holds, no new channel).
          this.synapse.subscribe(chan, async () => { got += 1 }, 'dash')
          const rtOnce = async (): Promise<void> => {
            await this.synapse.publish({
              type: 'telemetry',
              id: `dash.rt.${Date.now()}`,
              selftest: true,
              state: 'done',
              reasoning_tokens: 0,
              content_tokens: 0,
              reasoning_frame: null,
              content_frame: null,
              content_tps: 0,
              started_at: new Date().toISOString(),
              last_tick_ms: 0,
            }, chan)
            await sleep(30)
          }
          await rtOnce()
          if (got !== 1) {
            await sleep(300)
            await rtOnce()
          }
          if (got !== 1) { this.synapse.unsub(chan); return rep.fault('bus-rt', `bus round-trip ${got}/1 on llm.telemetry`) }
          this.synapse.unsub(chan)
          // (ii) log file: append + read back own bytes.
          const logRel = process.env.DASH_SELFTEST_LOG ?? 'logs/carl.log'
          const tag = `selftest.dash.${Date.now()}`
          try {
            await new Promise<void>((resolve, reject) => {
              // explicit promise wrap: the @types/node v20 typings expose no
              // (path, data, options) appendFile overload that carries an
              // encoding option — the callback form is the typed surface.
              appendFile(logRel, new Date().toISOString() + ' dash.selftest ' + tag + '\n', 'utf8', (err) => { if (err !== null) reject(err); else resolve() })
            })
          } catch (e) { return rep.fault('log', `log append: ${(e as Error).message}`) }
          await sleep(20)
          let last = ''
          try {
            const raw = readFileSync(logRel, 'utf8')
            const lines = raw.split('\n').filter((l) => l.length > 0)
            last = lines.slice(-50).join('\n')
          } catch (e) { return rep.fault('log', `log readback: ${(e as Error).message}`) }
          if (!last.includes(tag)) return rep.fault('log', 'log readback: own tag not in last 50 lines')
          // (iii) disk: statfs of the log volume.
          const free = await statFsFreeBytes(logRel)
          if (free < DASH_DISK_FLOOR_BYTES) return rep.fault('disk', `disk free ${Math.round(free / 1048576)}MB < floor ${DASH_DISK_FLOOR_BYTES / 1048576}MB`)
          // (iv) byId ring (bounded store live, no cap abuse).
          const snap = await this.telemetrySnapshot()
          if (snap === null) return rep.fault('byId', 'telemetry snapshot unreachable')
          const ms = Date.now() - t0
          rep.done(ms)
          this.recordProbe('TELE', true, ms, `rt=1 log=yes disk=${Math.round(free / 1048576)}MB byId=${snap.size}`)
        } catch (e) {
          rep.fault('probe-throw', (e as Error).message)
        }
      })()
    }
    this.immmu.registerLeg('TELE', probeTele)

    // NERV leg — lifecycle + fan-out + dark-reject + validator-reject.
    const probeNerv: ImmuProbeFn = (rep) => {
      const t0 = Date.now()
      // NO rep.report: the IMMU pacer is the SOLE dot driver (DECISION 7).
      void (async () => {
        try {
          // (i) subscribe→emit→verify→unsubscribe on a transient subscription.
          const ch = 'dash.test.lifecycle'
          const seen: unknown[] = []
          const h = (ev: unknown): void => { seen.push(ev) }
          this.bus.on(ch, h)
          this.bus.emit(ch, { id: 'pre' })
          await sleep(5)
          if (seen.length !== 1) { this.bus.off(ch, h); return rep.fault('lifecycle', `subscribe->emit ${seen.length}/1`) }
          this.bus.off(ch, h) // unsubscribe
          this.bus.emit(ch, { id: 'post' })
          await sleep(5)
          if (seen.length !== 1) return rep.fault('lifecycle', 'delivery after unsubscribe (piping leak)')
          // (ii) fan-out: one publish, 2 concurrent subs, both get it.
          const fch = 'dash.test.fanout'
          const a: unknown[] = []
          const b: unknown[] = []
          const ha = (ev: unknown): void => { a.push(ev) }
          const hb = (ev: unknown): void => { b.push(ev) }
          this.bus.on(fch, ha)
          this.bus.on(fch, hb)
          this.bus.emit(fch, { id: 'fan' })
          await sleep(5)
          this.bus.off(fch, ha)
          this.bus.off(fch, hb)
          if (a.length !== 1 || b.length !== 1) return rep.fault('fanout', `fan-out a=${a.length} b=${b.length} (want 1,1)`)
          // (iii) rejection probe: a lane DASH is not entitled for → expect
          // rejection; the rejection IS the pass.
          const darkSeen: unknown[] = []
          this.synapse.subscribe('dash.test.darklane', () => { darkSeen.push('x'); return Promise.resolve() }, 'dash')
          await sleep(20)
          if (darkSeen.length !== 0) return rep.fault('reject', 'rejection: the dark lane accepted a subscribe (gate broken)')
          // (iii-b) validator choke point: publish a malformed payload to
          // 'llm.done' — the validator rejects it BEFORE bus.emit.
          let badSeen = 0
          const badH = (ev: unknown): void => {
            const p = ev as { id?: string }
            if (p && p.id === 'immutest-bad') badSeen += 1
          }
          this.bus.on('llm.done', badH)
          await this.synapse.publish({ type: 'not-a-done', id: 'immutest-bad' }, 'llm.done')
          await sleep(20)
          this.bus.off('llm.done', badH)
          if (badSeen !== 0) return rep.fault('reject', 'validator reject did not hold (bad llm.done frame reached a listener)')
          const ms = Date.now() - t0
          rep.done(ms)
          this.recordProbe('NERV', true, ms, 'lifecycle + fan-out 2sub + dark-reject + validator-reject (llm.done)')
        } catch (e) {
          rep.fault('probe-throw', (e as Error).message)
        }
      })()
    }
    this.immmu.registerLeg('NERV', probeNerv)

    // CRTX leg — MIGRATED (operator canon 2026-10-28): the CORTEX faculty
    // self-tests ITSELF. The legacy DASH-firing `cortex.request` boot ping
    // (the #IDENTITY route — the model spent the whole 16-token budget in
    // reasoning_text, 0 content frames, sawContent never true, the leg
    // budget-faulted at ~234ms) is REMOVED as the CRTX settle source; the
    // new leg closure + registration live in main.ts (cortex.cortexSelfTest()
    // + dash.getImmu().registerLeg('CRTX', …)). This file no longer owns the
    // CRTX leg.

// The LLM1 leg — MIGRATED (operator canon 2026-10-28): the LLM faculty
    // self-tests ITSELF against vLLM DIRECTLY (module defaults: no #IDENTITY,
    // no reasoning — the module's own selfTest() verdict). The legacy
    // probeLlm1 ping-ride (the boot ping round's llm.telemetry done-frame
    // usage-convergence latch) is REMOVED as the LLM1 settle source; the new
    // leg closure + registration live in main.ts (llm.selfTest() +
    // dash.getImmu().registerLeg('LLM1', …)). This file no longer owns the
    // LLM1 leg.
    this.wired = true
  }

  // The current live session — the one the self-test rows paint onto.
  // CYCLE-3 WIRING FIX: prefer the session currently in a LIVE ROUND
  // (a round the LLM is actively serving — the operator's browser has an
  // open SSE GET; its bridge is persistent across the process, so the
  // LLM returns the ping round's frames on the SAME connection the
  // operator was working on). Fallback: the most-recently-attached
  // (the spec's "late-joiner sees the sequence it attached to").
  //
  // The probe previously picked by most-recent attach (a closed-over
  // capture connection from the PRE-fixer's curl was more recent than
  // the operator's live render connection at the moment the CRTX leg
  // fired) — the ping round landed on a closed session; DASH's own
  // settleRound (llm.done) posted the settle on a session that had
  // already been detached by `res close` → the IMMU seq's CRTX/LLM1
  // slots never settled → the 15s backstop FAULTed them both at
  // ~1774ms. With the LIVE-ROUND priority, the ping round rides the
  // connection the LLM has already acknowledged — the round settles on
  // the SAME connection that proves the evidence (no detach race).
  private liveSession(): DashSession | null {
    // Pass 1: sessions with an in-flight round (the LLM is actively
    // streaming — those are the live operator sessions).
    let bestRound: DashSession | null = null
    let bestAttach: DashSession | null = null
    for (const s of this.sessions.values()) {
      if (s.closed) continue
      if (bestAttach === null || s.attachedAt > bestAttach.attachedAt) bestAttach = s
      if (bestRound === null) {
        for (const r of s.rounds.values()) {
          if (!r.settled) { bestRound = s; break }
        }
      }
    }
    return bestRound ?? bestAttach
  }

  // --- the DASH interpreter: event → char-band bytes (the SOLE tape owner) ---

  private onImmuSelftest(ev: Record<string, unknown>): void {
    const type = typeof ev.type === 'string' ? ev.type : ''
    // --- n-gap rule (spec v5 replay step 5; REVIEW ROUND 1 FIX — BLOCKING) --
    // The first LIVE event after a mid-run replay must have n === seq+1.
    // `n > seq+1` → a gap was missed: re-read boot.status + re-type the
    // tape (max 3 rounds), then the final-slot. `n <= seq` → stale (an
    // event from a PRIOR sequence already typed by the snapshot): drop it
    // for this session (the snapshot already painted it).
    const seqN = typeof ev.n === 'number' ? ev.n : NaN
    for (const s of this.sessions.values()) {
      if (s.closed || !s.gapCheckArmed) continue
      if (Number.isNaN(seqN) || seqN <= s.gapSnapshotSeq) {
        // stale (or an event without n — e.g. boot.refused): drop, disarm.
        s.gapCheckArmed = false
        continue
      }
      if (seqN === s.gapSnapshotSeq + 1) {
        // aligned: this event is the first live event after the snapshot.
        // Disarm (the rest of the sequence is covered by live events) and
        // let it fall through to the normal dispatch below.
        s.gapCheckArmed = false
        continue
      }
      // seqN > snapshotSeq+1 → GAP: re-read + re-type (max 3 rounds, then
      // final-slot). Drop THIS event (the re-read will re-type what it
      // covers) and schedule the re-read.
      s.gapRereads += 1
      s.gapCheckArmed = false
      if (s.gapRereads > 3) {
        // FINAL-SLOT: stop re-reading; render the final snapshot state (the
        // next live `selftest.complete` finishes the band).
        void this.gapReread(s)
        this.recordProbe('N-GAP-FINAL', false, 0, `gapRereads exceeded 3 for seq=${s.gapSnapshotSeq} at ev n=${seqN}`)
        continue
      }
      void this.gapReread(s)
      this.recordProbe('N-GAP-REREAD', true, 0, `re-read ${s.gapRereads}/3 for seq=${s.gapSnapshotSeq} at ev n=${seqN}`)
      continue
    }
    if (type === 'selftest.start') {
      const module = typeof ev.module === 'string' ? ev.module : ''
      for (const s of this.sessions.values()) if (!s.closed) this.interpStart(s, module, ev)
    } else if (type === 'selftest.progress') {
      const module = typeof ev.module === 'string' ? ev.module : ''
      const pct = typeof ev.pct === 'number' ? Math.max(0, Math.min(100, Math.floor(ev.pct))) : 0
      for (const s of this.sessions.values()) if (!s.closed) this.interpProgress(s, module, pct)
    } else if (type === 'selftest.done') {
      const module = typeof ev.module === 'string' ? ev.module : ''
      const ms = typeof ev.ms === 'number' && Number.isFinite(ev.ms) ? Math.max(0, Math.round(ev.ms)) : 0
      const attempt = typeof ev.attempt === 'number' ? ev.attempt : 1
      for (const s of this.sessions.values()) if (!s.closed) this.interpSettle(s, module, true, ms)
      this.recordProbe(module + (attempt > 1 ? '(retry)' : ''), true, ms, 'settled from IMMU event')
    } else if (type === 'selftest.fault') {
      const module = typeof ev.module === 'string' ? ev.module : ''
      const ms = typeof ev.ms === 'number' && Number.isFinite(ev.ms) ? Math.max(0, Math.round(ev.ms)) : 0
      const reason = typeof ev.reason === 'string' ? ev.reason : ''
      const detail = typeof ev.detail === 'string' ? ev.detail : ''
      for (const s of this.sessions.values()) if (!s.closed) this.interpSettle(s, module, false, ms)
      this.recordProbe(module, false, null, `${reason}${detail ? ' — ' + detail : ''}`)
    } else if (type === 'selftest.complete') {
      const ok = ev.ok === true
      const totalMs = typeof ev.ms_total === 'number' && Number.isFinite(ev.ms_total) ? Math.round(ev.ms_total) : 0
      for (const s of this.sessions.values()) if (!s.closed) this.interpComplete(s, ok, totalMs)
      this.recordProbe('SELFTEST', ok, totalMs, ok ? 'PASSED — all legs settled ok (IMMU)' : 'FAULT — a leg did not settle ok (IMMU)')
    } else if (type === 'boot.refused') {
      const reason = typeof ev.reason === 'string' ? ev.reason : ''
      if (reason === 'busy') {
        // DASH's own attach (dash_id='dash') is the canonical caller and is
        // always allowed; a refused{busy} here means another sequence is
        // in flight (the in-flight lock: one per process). The refused
        // dashboard subscribes (the interpreter is always subscribed) +
        // renders the live tail — the operator-locked BUSY row.
        for (const s of this.sessions.values()) if (!s.closed) this.interpBusy(s)
      }
      // reason='auth': DASH is an allowed caller (dash_id='dash') — it never
      // sees an auth refuse; the hard log is IMMU's (stderr).
    }
    // selftest.ignored: telemetry-only — the interpreter ignores it (the
    // lane's own contract; a settle is DASH's sole authority via the done /
    // fault events above — the lag is never double-rendered).
  }

  private interpStart(s: DashSession, module: string, ev: Record<string, unknown>): void {
    // OP-LOCKED BAND PAINT: under the operator-locked "attach-time band
    // paint", the leg's row is ALREADY on tape (armed from the attach
    // tape paint — or from a replay done-fast-path). A `start` event only
    // transitions the row to live (dot progress paints it in place).
    // Legacy path (no attach paint — e.g. a mid-run snapshot where the
    // leg was untyped) still types the armed skeleton once, as before.
    void ev
    const m = module as DashBootModule
    if (!(m in s.band.rows)) return
    if (s.band.rows[m] === 'armed') {
      // The row is on tape: it's the leg's live run beginning.
      s.band.rows[m] = 'live'
      s.band.painted[m] = -1
      s.band.pendingPct[m] = -1
      this.ensureStrip(s)
      return
    }
    if (s.band.rows[m] !== 'pending') return // a re-start (attempt 2) reuses the row
    // start{module}: type '> ' + label + 2sp + 14-col zone (12 dot field +
    // 2-col boundary — typed as 14 SPACES; the pacer overwrites in place)
    // (NO CRLF — the row is un-closed; the settle owns the CRLF).
    this.type(s, '> ' + dashDisplayLabel(m) + '  ' + T_SPACED_ZONE)
    s.band.rows[m] = 'live'
    s.band.painted[m] = -1
    s.band.pendingPct[m] = -1
    this.ensureStrip(s)
  }

  private interpProgress(s: DashSession, module: string, pct: number): void {
    const m = module as DashBootModule
    if (!(m in s.band.rows)) return
    if (s.band.rows[m] !== 'live') return // a settled leg ignores progress
    if (pct <= s.band.painted[m]) return
    s.band.pendingPct[m] = pct
    // LANE-LOCK: the zone is on tape ONLY after the title/header + label
    // prefix + any prior row have drained the type queue; a paint mid-queue
    // would erase past the row's own label (the pacer's old mis-target, now
    // structurally barred: the interpreter is the SOLE zone driver — the
    // only other emitters into this session's queue are title/footer/tail,
    // which type on their own lines and never open a zone).
    const q = this.typeQueues.get(s.id)
    if (q && q.length > 0) return
    this.paintZone(s, m, pct)
  }

  private paintZone(s: DashSession, m: DashBootModule, pct: number): void {
    // Overwrite the 14-col zone: BS×14 + dots(round(pct/100×12)) + spaces
    // (the zone's own width — width-constant; the 2-col boundary is the
    // 13th+14th cols). A settled leg ignores progress (the pacer stops).
    const dots = Math.round((pct / 100) * BANNER_DOT_COUNT)
    s.band.painted[m] = pct
    this.type(s, T_ZONE_ERASE + T_DOT.repeat(dots) + ' '.repeat(BANNER_DOT_COUNT + 2 - dots))
  }

  private ensureStrip(s: DashSession): void {
    // 10Hz dot strip (the interpreter's progress pace): re-paints the
    // PENDING pct the lane-lock held (the zone was not on tape when the
    // pacer's tick landed). The SOLE dot driver is IMMU's pacer — this is
    // only the drain of the lane-lock's deferred paints.
    if (s.stripIv) return
    const iv = setInterval(() => {
      if (s.closed) { clearInterval(iv); s.stripIv = null; return }
      let acted = false
      for (const m of DASH_BOOT_MODULES) {
        const mm = m as DashBootModule
        if (s.band.rows[mm] !== 'live') continue
        const pending = s.band.pendingPct[mm]
        if (pending > s.band.painted[mm]) {
          const q = this.typeQueues.get(s.id)
          if (q && q.length > 0) continue
          this.paintZone(s, mm, pending)
          acted = true
        }
      }
      if (!acted && s.band.settled) { clearInterval(iv); s.stripIv = null }
    }, 100)
    iv.unref()
    s.stripIv = iv
  }

  private interpSettle(s: DashSession, module: string, ok: boolean, ms: number): void {
    const m = module as DashBootModule
    if (!(m in s.band.rows)) return
    // OP-LOCKED B rule: the settle IS the repaint. If the row is STILL
    // UNPAINTED (state === 'pending' — a leg settled before the attach's
    // tape paint typed it, or a replay missed the row), the settle ANCHORS
    // the row: type the armed skeleton, then rewind + state + CRLF.
    if (s.band.rows[m] === 'pending') {
      this.type(s, '> ' + dashDisplayLabel(m) + '  ' + T_DOT.repeat(BANNER_DOT_COUNT) + '  ')
    }
    // The row's state zone is on tape (either the attach paint's dots, a
    // live rerun's dot-paint, or the fresh arm above). The locked repaint
    // is: \b×14 + state + CRLF. The rewind erases exactly the 14 armed cols
    // (2 boundary + 12-dot field) and re-emits the state verbatim.
    this.paintSettledRow(s, m, ok, ms)
    // Set the row latch (FAULT = the word only — no detail, no retry text,
    // the operator-locked band). The row CRLF-terminates here (every settle
    // path owns its T_NL — the FIRST \r\n of the row is the row's).
    s.band.rows[m] = ok ? 'done-ok' : 'done-fault'
    BOOT_DONE[m] = true
    BOOT_MS[m] = ms
  }

  // =============================================================
  // OPERATOR-LOCKED SETTLED ROW (the LOCK, not a derivation —
  // round 2 re-verified against the armed skeleton bytes):
  //
  //   \b×14 + 12×U+00B7 + 2×U+0020 + <state> + CRLF
  //
  // Final visible row for the 2-digit-ms OK case is BYTE-EXACTLY:
  //   '> DASH' + '  ' + '·'×12 + '  ' + 'OK * 56ms' + '\r\n'
  //     (2)    (4)    (2)    (12)       (2)    (9)    (CRLF)
  //           = 31 body code units + CRLF = 33 total code units
  //
  // The \\b count is computed FROM the armed skeleton: interpStart
  // types 14 cols after the label (2sp boundary + 12-col dot field
  // = the 14-col zone), so the rewind is exactly 14. FAULT row:
  // '\b'×14 + 12 dots + '  ' + 'FAULT' + CRLF = 27 body code units.
  // PAD ceiling: any state > 9 code units widens the row (NNNms OK
  // = 32 body) — an accepted capture-constraint, not a defect: the
  // operator literal pins the 2-digit OK and the FAULT word only.
  // =============================================================
  /** Type the EXACT settled row for module m. The shuttle is locked:
   *  BS×14 + state + CRLF — the state zone alone is rewritten (the OP-LOCKED
   *  B rule: the settle is the ONLY repaint of the row; the 12· + 2sp dot
   *  field is painted at attach and NOT re-emitted). The rewind erases
   *  exactly the armed grid (2 boundary + 12-dot field = 14 cols, computed
   *  from the arm bytes). The final visible row for the 2-digit-ms OK case
   *  is BYTE-EXACTLY '> LABEL  ············ OK * NNms' (armed 25 cols; the
   *  state zone occupies cols 16-29). FAULT row = '…····· FAULT'. */
  private paintSettledRow(s: DashSession, m: DashBootModule, ok: boolean, ms: number): void {
    const state = ok ? T_OK + String(Math.min(999, ms)).padStart(2, '0') + 'ms' : T_FAULT
    this.type(s, T_ZONE_ERASE + state + T_NL)
  }

  // CRTX settle — RETIRED (MIGRATION 2026-10-28): the CRTX leg settles from
  // the CORTEX's own DUMMY self-test (cortex.cortexSelfTest(), settled
  // DIRECT via rep.done/rep.fault by the leg closure in main.ts). The old
  // ping-observed `dash.ext.done/fault{CRTX}` path was the D1 defect (the
  // #IDENTITY route burned the 16-token budget in reasoning_text;
  // sawContent could never be true) and is removed as the CRTX settle
  // source. `sawContent` is RETAINED for user-round purposes below.
  // (Private method deleted: no publish sites remain.)

  private interpBusy(s: DashSession): void {
    // boot.refused{busy}: type '> …  BUSY' + CRLF. The dashboard subscribes
    // (the interpreter is the sole owner, already subscribed) + renders the
    // live tail of the in-flight sequence.
    if (s.band.settled) return
    this.type(s, '> …  BUSY' + T_NL)
  }

  // The finalize tail of the band: the R-S narrative row's SINGLE final
  // repaint (rewind + re-emit final word + CRLF) and the band latch.
  //
  // OP-LOCKED BAND PAINT: the attach tape (streamBanner → attachTapePaint)
  // already painted, BEFORE any settle repaint:
  //   title + ONE blank line + SELF-TEST header + 5 armed rows + R-S PENDING
  //   (eye U+25CC) + 32×'-' + ROM/MEM footer + READY. + CRLF + the block
  //   cursor U+2588 (no trailing CRLF).
  // So band-complete ONLY repaints the R-S line — the locked literals
  // (verbatim, operator-locked):
  //   all-OK      → 'R-S RESOLVED ⬤ SYSTEM BOUND'   (eye U+25CE)
  //   any FAULT   → 'R-S SCANNING ◌ SYSTEM BANKRUPT' (eye U+25CC preserved)
  // Rewind: BS×([T_RS_PENDING].length = 27) returns to row start (25 if a
  // live dot-paint ran in the zone — but attach paint never dots the R-S
  // row, so the pending body is always exactly 27 cols on tape); the final
  // word is then re-emitted from col 0. The 32-dash + footer + READY. +
  // block cursor are NOT re-typed — the tail is painted once at attach.
  private rsRewind(): string {
    return T_BS.repeat(T_RS_REWIND)
  }
  private interpComplete(s: DashSession, ok: boolean, msTotal: number): void {
    void msTotal
    if (s.band.settled) return
    s.band.settled = true
    if (s.stripIv) { clearInterval(s.stripIv); s.stripIv = null }
    // The tail is ALREADY on tape from the attach paint (blank | footer |
    // READY. | block cursor). The R-S line repaints ONCE here — the only
    // remaining repaint in the band.
    this.paintRSFinal(s, ok)
    this.recordProbe('SELFTEST', ok, 0, ok ? 'PASSED — all legs settled ok (IMMU)' : 'FAULT — a leg did not settle ok (IMMU)')
  }

  // The R-S line's band-complete rewrite: rewind + re-emit the final word.
  // Latch: painted at attach as T_RS_PENDING; the final is the locked
  // literal for this run's verdict. PENDING→final only (no intermediate
  // repaints) — the SCANNING word lands the first time any FAULT exists
  // at band-complete (precedence: FAULT filed while a later leg is still
  // open → SCANNING immediately; the operator's veto window ships).
  private paintRSFinal(s: DashSession, ok: boolean): void {
    if (!s.band.r_s_pending) return
    s.band.r_s_pending = false
    const final = ok ? T_RS_RESOLVED : T_RS_SCANNING
    // Rewind the PENDING row's cols and re-emit the 22-col final body:
    // BS×(T_RS_REWIND) + final body (no CRLF here — the row keeps the
    // attach paint's CRLF; the prompt stays the last byte on the wire).
    this.type(s, this.rsRewind() + final)
  }

  // --- session lifecycle -------------------------------------------------------
  attachSession(res: ServerResponse, host: string): DashSession {
    const id = crypto.randomUUID()
    const s: DashSession = {
      id,
      res,
      connTag: id, // the SSE GET's id IS the tag the POST echoes back
      attachedAt: Date.now(),
      closed: false,
      failStreak: 0,
      backoffUntil: 0,
      rounds: new Map(),
      band: initInterp(),
      ttfts: [],
      outTps: [],
      tokenSparkline: [],
      promptsSent: 0,
      busy: false,
      tickTimers: [],
      tickLastFrame: Date.now(),
      birthLineCount: BIRTH_LINE_MAX,
      typeIv: null,
      stripIv: null,
      spinnerLen: 0,
      pingOpen: false,
      craaAdopted: false,
      gapCheckArmed: false,
      gapSnapshotSeq: 0,
      gapRereads: 0,
    }
    this.sessions.set(id, s)
    // zhang: close ALL SSE writers on service stop + every client close.
    res.once('close', () => this.detachSession(s, 'client-close'))
    // 30s idle cap: GC the per-connection state (leak #2 discipline).
    const idle = setInterval(() => {
      if (s.closed) return
      if (Date.now() - s.tickLastFrame > DASH_CONN_IDLE_CAP_MS && !s.busy) {
        this.detachSession(s, 'idle-cap')
      } else {
        s.tickLastFrame = Date.now()
      }
    }, 10_000)
    idle.unref()
    s.tickTimers.push(idle)

    // Attach order: sseinit → ready → title/header → boot status snapshot +
    // auto-trigger (the self-test re-triggers on EVERY /dash attach — spec
    // DECISION 2). The interpreter types the title/header, then each start
    // event types its row, each settle its verdict, and complete the tail.
    this.send(s, { t: 'sseinit', session: id, tag: s.connTag, host, gate: [...DASH_GATE_HOSTS] })
    this.send(s, { t: 'ready', ok: true })
    this.streamBanner(s)
    void this.requestSelfTestBoot(s)

    // Continuous ticks from ready onward (independent of chat activity).
    const statsIv = setInterval(() => this.pushStats(s), STATS_POLL_MS)
    statsIv.unref()
    s.tickTimers.push(statsIv)
    return s
  }

  // REPLAY / LATE-JOINER (spec v5): on attach, DASH POSTs its own boot
  // status (a snapshot with `seq` === `n`), then decides:
  //   done:true        → type the complete tape (all rows + tail + READY +
  //                      prompt) + set band_settled=true (fast-path, no
  //                      subscribe, no further events).
  //   pre-bootstrap    → type nothing, wait for the auto-trigger boot.start.
  //   running:true     → settled legs: full rows. Open leg: row + dots at
  //                      current pct. Pending: untyped.
  // Then subscribe (the interpreter is module-level) + the n-gap rule:
  //   first live event: n === seq+1 → OK; n > seq+1 → re-read + re-type
  //   (max 3 rounds, then the final-slot); n <= seq → stale, drop.
  private async requestSelfTestBoot(s: DashSession): Promise<void> {
    if (s.closed) return
    try {
      const ctl = new AbortController()
      const to = setTimeout(() => ctl.abort(), 800)
      const res = await fetch(this.controlBase() + '/dash', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: '127.0.0.1', 'x-dash-session': s.connTag },
        body: JSON.stringify({ boot_status: true, dash_id: 'dash' }),
        signal: ctl.signal,
      })
      clearTimeout(to)
      if (!res.ok) return
      const j = (await res.json()) as {
        snapshot?: {
          running?: boolean
          done?: boolean
          seq?: number
          legs?: { module: string; state?: string; verdict?: 'ok' | 'fault' | null; ms?: number | null; pct?: number; attempt?: number }[]
          complete_payload?: { ok?: boolean; ms_total?: number } | null
        }
      }
      const snap = j.snapshot
      if (!snap || s.closed) return
      // RESTART/interrupt detection (v5 — replaces the unreachable
      // n_snapshot===0): on re-attach, if the snapshot is running:false +
      // done:false (no live sequence) and this instance previously saw a
      // non-pending state for this session, the sequence was interrupted by
      // a crash/process-restart → treat as interrupted: re-type fresh (the
      // auto-trigger below fires boot.start).
      const seenBefore = Object.values(s.band.rows).some((v) => v !== 'pending')
      const preBootstrap = !snap.running && !snap.done && (snap.legs ?? []).every((l) => l.state === 'pending')
      if (!snap.running && !snap.done && seenBefore) {
        for (const m of DASH_BOOT_MODULES) {
          const mm = m as DashBootModule
          s.band.rows[mm] = 'pending'
          s.band.painted[mm] = -1
          s.band.pendingPct[mm] = -1
        }
      }
      if (snap.done === true) {
        // OP-LOCKED BORN SETTLED: paint every row at its RESOLVED state
        // (settled rows settled, zero repaint — no BS frames) + R-S final.
        const legs = (snap.legs ?? []).map((l) => ({ module: (l.module ?? '') as DashBootModule, verdict: l.verdict === 'fault', ms: typeof l.ms === 'number' ? Math.max(0, Math.round(l.ms)) : 0 }))
        const anyFault = legs.some((l) => l.verdict)
        for (const m of DASH_BOOT_MODULES) {
          const mm = m as DashBootModule
          const leg = legs.find((l) => l.module === mm)
          if (!leg) continue
          const state = !leg.verdict ? T_OK + String(Math.min(999, leg.ms)).padStart(2, '0') + 'ms' : T_FAULT
          this.type(s, '> ' + dashDisplayLabel(mm) + '  ' + T_DOT.repeat(BANNER_DOT_COUNT) + '  ' + state + T_NL)
          s.band.rows[mm] = leg.verdict ? 'done-fault' : 'done-ok'
          s.band.painted[mm] = 100
          BOOT_DONE[mm] = true
          BOOT_MS[mm] = leg.ms
        }
        this.interpComplete(s, !anyFault, typeof snap.complete_payload?.ms_total === 'number' ? snap.complete_payload.ms_total : 0)
        return
      }
      if (preBootstrap) {
        // pre-bootstrap: type nothing, wait for the auto-trigger boot.start
        // (DECISION 2). If this attach is the one that owns the trigger, it
        // fires below; a late-joiner's tab renders the same sequence live.
      } else if (snap.running === true) {
        this.replayFromSnapshot(s, snap)
        // n-gap rule (spec v5 step 5; REVIEW ROUND 1 FIX): arm the first-
        // live-event check — n must === snap.seq+1, else re-read + re-type
        // (max 3 rounds, then the final-slot).
        s.gapCheckArmed = true
        s.gapSnapshotSeq = typeof snap.seq === 'number' ? snap.seq : 0
        s.gapRereads = 0
      }
      // THE AUTO-TRIGGER (DECISION 2) — every attach attempts boot.start;
      // IMMU's in-flight lock is the gate (busy → a refused dashboard
      // renders the live sequence; a fresh process starts the sequence).
      this.autoTrigger(s)
    } catch {
      // a POST failure (e.g. the service is still mid-boot) is non-fatal:
      // the interpreter will still type the band from live events; if the
      // sequence doesn't start, its probed legs are simply untyped (no hang
      // — the backstop is IMMU's, not the client's).
      this.autoTrigger(s)
    }
  }

  // OP-LOCKED ATTACH TAPE PAINT: the full tape as char(s) frame(s) — NO
  // per-row dot-typing timer, NO typing one row at a time (chunked chars
  // frames are fine — see the 50ms type queue — what is NOT allowed is a
  // timer that animates one row's dots before the next row's bytes land).
  // This runs synchronously inside `streamBanner` on attach (BEFORE any
  // settle repaint), so the FIRST chars payload(s) contain the ENTIRE
  // tape:
  //   line1: BANNER_TITLE + CRLF
  //   line2: BANNER_SELFTEST_ROW + CRLF
  //   5 rows: '> ' + LABEL(4) + 2sp + 12· + 2sp + CRLF (armed, leg order)
  //   R-S row: T_RS_PENDING + CRLF (eye U+25CC open while pending)
  //   32-dash footer line + CRLF
  //   ROM n/a · MEM <RSS>MB + CRLF (bannerStatsRow — the server's LIVE RSS)
  //   READY. + CRLF
  //   block cursor U+2588 (no trailing CRLF — decision 15)
  // Every row is CRLF-terminated (E): the prompt row is the sole exception.
  private attachTapePaint(s: DashSession): void {
    for (const m of DASH_BOOT_MODULES) {
      const mm = m as DashBootModule
      this.type(s, '> ' + dashDisplayLabel(mm) + '  ' + T_DOT.repeat(BANNER_DOT_COUNT) + '  ' + T_NL)
      s.band.rows[mm] = 'armed'
    }
    this.type(s, T_RS_PENDING + T_NL)
    s.band.r_s_pending = true
    this.type(s, '-'.repeat(32) + T_NL)
    this.type(s, bannerStatsRow() + T_NL)
    this.type(s, BANNER_READY_ROW + T_NL)
    this.type(s, T_PROMPT) // block cursor: the FINAL byte of the attach paint
  }

  private autoTrigger(s: DashSession): void {
    if (!this.wired) return
    const r = this.immmu.bootStart('dash', s.connTag)
    // busy → the in-flight lock is the gate (correct): this attach renders
    // the live band (the interpreter is subscribed module-wide). auth →
    // DASH is always allowed; an auth refuse here would be a process-level
    // misfire (the hard log is IMMU's).
    void r
  }

  /** Mid-run snapshot → tape (spec v5 replay step 3): settled legs →
   *  BORN SETTLED rows (state painted, zero repaint); the open leg → the
   *  armed row (the pacer's live dots take over); pending → untyped
   *  (the start event types the arm). Idempotent per leg. */
  private replayFromSnapshot(s: DashSession, snap: {
    legs?: { module: string; state?: string; verdict?: 'ok' | 'fault' | null; ms?: number | null; pct?: number }[]
  }): void {
    for (const leg of snap.legs ?? []) {
      const m = leg.module as DashBootModule
      if (!(m in s.band.rows)) continue
      const st = leg.state ?? 'pending'
      if (st === 'settled' && leg.verdict !== null) {
        const state = leg.verdict === 'ok' ? T_OK + String(Math.min(999, typeof leg.ms === 'number' ? Math.max(0, Math.round(leg.ms)) : 0)).padStart(2, '0') + 'ms' : T_FAULT
        this.type(s, '> ' + m + '  ' + T_DOT.repeat(BANNER_DOT_COUNT) + '  ' + state + T_NL)
        s.band.rows[m] = leg.verdict === 'fault' ? 'done-fault' : 'done-ok'
        s.band.painted[m] = 100
        BOOT_DONE[m] = true
        BOOT_MS[m] = typeof leg.ms === 'number' ? Math.max(0, Math.round(leg.ms)) : null
      } else if (st === 'open') {
        this.type(s, '> ' + m + '  ' + T_DOT.repeat(BANNER_DOT_COUNT) + '  ' + T_NL)
        s.band.rows[m] = 'live'
        const p = typeof leg.pct === 'number' ? Math.max(0, Math.min(100, Math.floor(leg.pct))) : 0
        s.band.painted[m] = p
        s.band.pendingPct[m] = p
        const dots = Math.round((p / 100) * BANNER_DOT_COUNT)
        this.type(s, T_ZONE_ERASE + T_DOT.repeat(dots) + ' '.repeat(BANNER_DOT_COUNT + 2 - dots))
        this.ensureStrip(s)
      }
    }
  }

  /** n-gap re-read (spec v5 step 5): re-fetch boot.status and re-type the
   *  band from the fresh snapshot. The tape is idempotent per leg, so this
   *  only PATCHES the legs that changed (settled-by-gap, a leg that moved
   *  to `settled`, or an open leg whose pct advanced). Called at most 3×
   *  after the arm check fires a gap (then the final-slot). */
  private async gapReread(s: DashSession): Promise<void> {
    if (s.closed) return
    try {
      const res = await fetch(this.controlBase() + '/dash', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: '127.0.0.1', 'x-dash-session': s.connTag },
        body: JSON.stringify({ boot_status: true, dash_id: 'dash' }),
        signal: AbortSignal.timeout(800),
      })
      if (!res.ok) return
      const j = (await res.json()) as {
        snapshot?: {
          running?: boolean
          done?: boolean
          seq?: number
          legs?: { module: string; state?: string; verdict?: 'ok' | 'fault' | null; ms?: number | null; pct?: number }[]
        }
      }
      const snap = j.snapshot
      if (!snap || s.closed) return
      if (snap.done === true) {
        // OP-LOCKED BORN SETTLED: paint every row at its recorded state
        // (settled rows settled, zero repaint) + R-S final.
        const legs = (snap.legs ?? []).map((l) => ({ module: (l.module ?? '') as DashBootModule, verdict: l.verdict === 'fault', ms: typeof l.ms === 'number' ? Math.max(0, Math.round(l.ms)) : 0 }))
        const anyFault = legs.some((l) => l.verdict)
        for (const m of DASH_BOOT_MODULES) {
          const mm = m as DashBootModule
          const leg = legs.find((l) => l.module === mm)
          if (!leg) continue
          const state = !leg.verdict ? T_OK + String(Math.min(999, leg.ms)).padStart(2, '0') + 'ms' : T_FAULT
          this.type(s, '> ' + dashDisplayLabel(mm) + '  ' + T_DOT.repeat(BANNER_DOT_COUNT) + '  ' + state + T_NL)
          s.band.rows[mm] = leg.verdict ? 'done-fault' : 'done-ok'
          s.band.painted[mm] = 100
          BOOT_DONE[mm] = true
          BOOT_MS[mm] = leg.ms
        }
        this.interpComplete(s, !anyFault, 0)
        return
      }
      this.replayFromSnapshot(s, snap)
      this.autoTrigger(s)
    } catch {
      // re-read failed (service mid-boot / network): non-fatal — the live
      // events continue to cover the band from where the snapshot left it.
    }
  }

  private detachSession(s: DashSession, reason: string): void {
    if (s.closed) return
    s.closed = true
    this.sessions.delete(s.id)
    if (s.typeIv) clearInterval(s.typeIv)
    this.typeQueues.delete(s.id)
    for (const iv of s.tickTimers) clearInterval(iv)
    if (s.stripIv) clearInterval(s.stripIv)
    // leak #1: a killed/hung round must not survive its connection — every
    // open round is aborted (and the LLM faculty publishes its terminal
    // llm.telemetry{status:'aborted'}) and its slot is freed.
    for (const rid of [...s.rounds.keys()]) {
      this.settleRound(s, rid, 'aborted')
      void this.synapse.publish({ type: 'abort', id: rid }, 'llm.abort')
    }
    try {
      if (!s.res.writableEnded) s.res.end()
    } catch {
      /* already gone */
    }
    this.recordProbe('DETACH', true, Date.now() - s.attachedAt, reason)
  }

  /** zhang: service stop — close all SSE writers. */
  closeAll(): void {
    this.stopped = true
    for (const s of [...this.sessions.values()]) this.detachSession(s, 'service-stop')
    if (this.vramTimer) clearInterval(this.vramTimer)
  }

  // --- IMMU boot control surface (main.ts's POST /dash branches) --------------
  // The in-process accessors: main.ts routes {boot_status:true,dash_id} →
  // bootStatus(dash_id) and {boot_start:{session},dash_id} →
  // bootStart(dash_id, session). The DASH faculty's IMMU is the SAME
  // in-process singleton the self-test runs on — one owner of probe timing,
  // one owner of the tape (this file), one control surface (these two).
  bootStatus(dashId: string): { status: 'ok' | 'refused'; snapshot?: unknown; refused?: { reason: string } } {
    return this.immmu.bootStatus(dashId)
  }
  bootStart(dashId: string, session: string): { status: 'ok' | 'refused'; refused?: { reason: string; eta_ms?: number } } {
    return this.immmu.bootStart(dashId, session)
  }

  activeSession(res: ServerResponse): DashSession | undefined {
    for (const s of this.sessions.values()) {
      if (!s.closed && s.res === res) return s
    }
    return undefined
  }

  sessionCount(): number {
    return this.sessions.size
  }

  /** self-test subject: current sessions' boot state + probe evidence. */
  selfTestSubject(): {
    sessions: number
    sessions_boot: { instantBoot: number; boot: Record<string, { state: string; ms: number | null }> }[]
    probes: { id: string; name: string; ok: boolean; ms: number | null; detail: string; at: number }[]
  } {
    return {
      sessions: this.sessions.size,
      sessions_boot: [...this.sessions.values()].map((s) => ({
        instantBoot: Date.now() - s.attachedAt,
        boot: Object.fromEntries(
          (DASH_BOOT_MODULES as DashBootModule[]).map((m) => [
            m,
            { state: s.band.rows[m] ?? 'pending', ms: BOOT_MS[m] },
          ]),
        ),
      })),
      probes: this.probeRing.slice(-24),
    }
  }

  // --- the wire (zhang backoff: 3 consecutive failed frames → 5*2^n capped
  // --- 60s; a writer that resumes after the backoff keeps working) ----------
  // --- the char band (the ONE visible frame kind; docs/char-band-wire.md) ----
  // type(s, text) enqueues ≤32-char {t:'chars'} chunks; a per-session 50ms
  // setInterval (~20Hz, the operator's operator-locked pacing limit) drains
  // ONE chunk per tick from the session's queue. The queue pauses naturally
  // on empty — no busy-wait, no DUR/REM timer. The server only ever types;
  // it never knows or touches the column.
  private type(s: DashSession, text: string): void {
    const chars = [...text]
    const q = this.typeQueues.get(s.id)
    if (!q) this.typeQueues.set(s.id, [])
    const qq = this.typeQueues.get(s.id)!
    for (let i = 0; i < chars.length; i += 32) qq.push(chars.slice(i, i + 32).join(''))
    if (s.typeIv) return
    const iv = setInterval(() => {
      const nq = this.typeQueues.get(s.id)
      const next = nq && nq.length > 0 ? nq.shift() : undefined
      if (next === undefined) {
        if (s.typeIv) clearInterval(iv)
        s.typeIv = null
        this.typeQueues.delete(s.id)
        return
      }
      this.send(s, { t: 'chars', c: next })
    }, 50)
    iv.unref()
    s.typeIv = iv
  }

  private send(s: DashSession, frame: DashFrame): void {
    if (s.closed || this.stopped) return
    const now = Date.now()
    if (now < s.backoffUntil) return // cooling after a fail streak
    const data = `data: ${JSON.stringify(frame)}\n\n`
    // zhang resume (probe-2 root cause): a CLOSED res gets write() === true
    // (data is buffered, 'finish' never fires) — so a kept-alive connection
    // killed mid-round would fail-streak into a 5-60s backoff and sink every
    // subsequent frame silently (the client sees ZERO frames after the
    // reset). The cork check makes the close observable on the same tick,
    // and detach still owns the full teardown; successful writes keep
    // zeroing the streak.
    const corked = s.res.destroyed || s.res.writableEnded || s.res.writableCorked > 0
    let ok = false
    let err: Error | null = null
    try {
      ok = !corked && s.res.write(data)
    } catch (e) {
      err = e as Error
    }
    if (ok) {
      s.failStreak = 0
      s.backoffUntil = 0
      s.tickLastFrame = now
      return
    }
    s.failStreak += 1
    s.tickLastFrame = now
    if (s.failStreak >= DASH_SSE_FAIL_LIMIT) {
      const n = s.failStreak - DASH_SSE_FAIL_LIMIT
      const backoff = Math.min(DASH_BACKOFF_CAP_MS, DASH_BACKOFF_BASE_MS * 2 ** n)
      s.backoffUntil = now + backoff
      this.recordProbe('ZANG', false, 0, `failStreak=${s.failStreak} backoff=${backoff}ms`)
    }
    if (err) this.detachSession(s, 'write-error')
    else if (s.res.destroyed) this.detachSession(s, 'socket-destroyed')
  }

  // --- per-round settlement (the sticky-error-guard override) -------------------
  // settleRound: a round's terminal frame (llm.done → ok, llm.error → fail,
  // llm.abort → aborted). The PING's settle is silent on the band (the
  // interpreter owns the row) — it is mapped to the probe's settle:
  //   • the ping's done frame (a content round) → the CRTX row's OK (the
  //     chain DASH→cortex→bus→LLM→back is PROVEN by the round itself) and
  //     → the LLM1 verification (onPingUsage: usage convergence ±1).
  //   • the ping's fail / aborted close (no usage) → the LLM1 row's FAULT
  //     (no fabricated OK) + the CRTX row's FAULT (the chain did not come
  //     back on this connection).
  // A USER send that lands mid-ping cancels it (CRAA — the ping's slot is
  // freed NOW and the user round's frames settle below it; the row was
  // already typed by the interpreter's start event and settles from the
  // user round's own frames — a user round's usage, if any, settles LLM1).
  private settleRound(s: DashSession, id: string, status: 'ok' | 'fail' | 'aborted'): void {
    const r = s.rounds.get(id)
    if (!r || r.settled) return
    r.settled = true
    const ms = Date.now() - r.t0
    if (r.firstContentAt !== null) {
      s.ttfts.push(r.firstContentAt - r.t0)
      if (s.ttfts.length > 128) s.ttfts.shift()
      if (r.lastTps !== null && Number.isFinite(r.lastTps) && r.lastTps > 0) {
        s.outTps.push(r.lastTps)
        if (s.outTps.length > 128) s.outTps.shift()
      }
    }
    if (!r.isPing) s.promptsSent += 1
    s.busy = false
    // The per-round map slot is freed the instant the round settles: a
    // killed/hung round cannot slime a living one.
    s.rounds.delete(id)
    if (r.isPing) {
      r.settled = true
      s.pingOpen = false
      return
    }
    // MIGRATION (2026-10-28): the ping branch above RETURNS — the old
    // CRTX/LLM1 ping-observed settle (interpCrtxSettle / onPingUsage →
    // dash.ext.done/fault) is retired as the legs' settle source (both
    // legs now self-test in their own faculties, settled DIRECT).
    // USER round: the round's own frames settle it (the tell-skip, if any,
    // already told the story on the band).
    // CRAA (cancel-and-adopt): a user send that lands while the connect-time
    // ping is still in flight OWNS the CRTX/LLM1 rows — the ping's round
    // slot is freed at the adopt (handleSend publishes the abort); THAT
    // abort triggers settleRound on the ping id (r.isPing → the leg
    // settles as canceled/fault there). When the user round ITSELF settles
    // with a done frame, onUserRoundSettled settles the two IMMU legs on
    // the ADOPTED round's evidence (the ping's tail is dark on the band —
    // the rows are already typed by the interpreter's start events, and a
    // same-tick selftest.done/fault event republishes the row's final
    // state over the wire — two dashboards, one truth).
    // REVIEW ROUND 1 FIX (BLOCKING): the adopt path previously let both
    // IMMU legs sit OPEN (the ping's settle was canceled, no reportDone /
    // reportFault fired) → deterministic FAULT / hidden retry. The legs
    // now settle on the user round's ms/usage, settled as OK or FAULT on
    // the adopted evidence, so they never dangle.
    if (status === 'ok') {
      if (s.spinnerLen > 0) {
        // no open zone behind the spinner (the band rows are settled or
        // pending their own settle): the spinner is pure scroll — erase it
        // in place.
        this.type(s, T_BS.repeat(s.spinnerLen))
        s.spinnerLen = 0
      }
      if (s.band.settled) {
        // post-boot: the stats line + prompt own the tail.
        this.type(s, '· ' + ms + 'ms | IN ' + r.inflame + ' / OUT ' + r.outtoken + T_NL + T_PROMPT)
      }
      // during boot the round's stats line stays dark on the band
      // (settle-only: the tail block types the READY verdict; the round's
      // stats remain on the telemetry lane).
      // REVIEW ROUND 1 FIX: settle the IMMU legs (CRTX/LLM1) on the ADOPTED
      // round's evidence. The user round settled OK — if it landed while
      // the boot ping was still in flight (CRAA adopt), the two legs must
      // settle as done on the user round's ms (never dangle open).
      this.onUserRoundSettled(s, r, ms)
    } else if (s.band.settled) {
      // the 'ERR …' line (a never-settling round's terminal for a user
      // round — clean, not sticky into the next round).
      this.type(s, 'ERR ' + status + T_NL + T_PROMPT)
    } else if (s.spinnerLen > 0) {
      // a round that settled FAIL before the band settled: the spinner was
      // scroll-only (no module row has its zone on tape yet).
      this.type(s, T_BS.repeat(s.spinnerLen))
      s.spinnerLen = 0
    }
  }

  // The CRAA adopt settle (REVIEW ROUND 1 FIX — BLOCKING): when a USER round
  // settles OK, and the boot ping was CANCELED by the user's send (CRAA
  // adopt), the two IMMU legs (CRTX/LLM1) MUST settle on the ADOPTED
  // round's evidence — the user round's ms + usage. The adopt is detected
  // via s.craaAdopted (set true in handleSend the instant the boot ping is
  // superseded; cleared here after we consume it).
  //
  // REVIEW ROUND 2 FIX (BLOCKING): handleSend now settles the IMMU legs at
  // the ADOPT moment via this.immmu.reportDone(...) (in-process call — the
  // lane never carries a module-origin done; error #4 fix). This function
  // therefore has TWO roles:
  //   (a) consume + clear the s.craaAdopted latch (bookkeeping), so the
  //       hook's "one-shot" semantics are preserved for any future reader.
  //   (b) recordProbe evidence — DASH's telemetry lane documents that the
  //       adopt + settle happened at this user round's settle time
  //       (the ms measured at the settle, NOT the 0ms that was used during
  //       the adopt — the in-flight round is DONE here, so we can report
  //       the settled real ms into the probe ring).
  // The IMMU legs were already published as selftest.done by IMMU at adopt
  // time; we do NOT re-publish `dash.ext.done` here (error #4: the lane
  // never carries a second module-origin done).
  private onUserRoundSettled(s: DashSession, r: DashRound, ms: number): void {
    // `sawContent` gate (retained for user-round purposes per the 2026-10-28
    // migration — a settled user round is OK only if it carried content):
    // record the probe evidence from the round's own tallies.
    const sawContent = r.contentFrames > 0
    if (!s.craaAdopted) return
    s.craaAdopted = false
    this.recordProbe('CRAA-ADOPT-SETTLE', sawContent, ms,
      `CRAA adopt: user round settled (ms=${ms} content=${r.contentFrames} outtok=${r.outtoken} sawContent=${sawContent ? 'yes' : 'no'}) — legs settled AT adopt; telemetry evidence only`)
  }

  // The LLM1 verification: usage convergence (±1) on the ping round's own
  // frames. DASH tallies its own inflame + outtoken from observed frames;
  // response.completed usage must agree (±1) — mismatch = FAULT. Fires the
  // external settle (dash.ext.done / dash.ext.fault) → the IMMU's external
  // settle route → selftest.done/fault → the interpreter's row paint.
  private onPingUsage(s: DashSession, r: DashRound, status: 'ok' | 'fail' | 'aborted'): void {
    const u = r.usageSeen
    const sawContent = r.contentFrames > 0
    const sawReasoning = r.reasoningFrames > 0 // Qwen3.8 hybrid: 0 is OK
    let ok = sawContent && status === 'ok'
    const mis: string[] = []
    if (u) {
      // ±1 convergence: DASH's own frame tally vs response.completed usage.
      if (Math.abs(r.outtoken - u.output_tokens) > 1) {
        ok = false
        mis.push(`outtoken ${r.outtoken} vs usage ${u.output_tokens}`)
      }
      if (u.reasoning_tokens > 0 && !sawReasoning) {
        ok = false
        mis.push('usage claims reasoning frames; none observed')
      }
    } else if (sawContent && status === 'ok') {
      // no usage frame on a CLOSED content round: structural mismatch.
      ok = false
      mis.push('no usage frame on closed content round')
    } else if (status !== 'ok') {
      ok = false
    }
    const ms = Date.now() - r.t0
    if (ok) {
      void this.synapse.publish({ type: 'dash.ext.done', module: 'LLM1', ms }, 'immu.selftest')
      this.recordProbe('LLM1', true, ms, `content=${r.contentFrames} reasoning=${sawReasoning ? r.reasoningFrames : 0}${u ? ` usage=${u.input_tokens}/${u.output_tokens}/${u.reasoning_tokens} conv=ok` : ''}`)
    } else {
      void this.synapse.publish({ type: 'dash.ext.fault', module: 'LLM1', reason: 'usage-mismatch', detail: mis.join('; ') || `round closed ${status}` }, 'immu.selftest')
      this.recordProbe('LLM1', false, null, mis.join('; ') || `round closed ${status}`)
    }
  }

  // --- the banner (the server OWNS the banner text; the client renders it) ---
  // The banner tape — title + SELF-TEST header, then the OP-LOCKED band
  // PRE-PAINT: the ENTIRE tape (5 armed rows + R-S PENDING + 32×'-' footer
  // + ROM/MEM + READY. + block cursor) emitted as chars frames, synchronously
  // at attach, BEFORE any settle repaint (the operator's lock: "paint
  // everything on the stream when they attach, no live typing on attach").
  private streamBanner(s: DashSession): void {
    // Each header line ends with its OWN T_NL (byte contract: every row
    // CRLF-terminated; the prompt is the ONLY non-CRLF line by design).
    // One blank line (T_NL alone) between the title and the SELF-TEST
    // header — the operator-locked layout (docs/char-band-wire.md §2).
    this.type(s, BANNER_TITLE + T_NL)
    this.type(s, T_NL)
    this.type(s, BANNER_SELFTEST_ROW + T_NL)
    this.attachTapePaint(s)
  }

  private recordProbe(name: string, ok: boolean, ms: number | null, detail: string): void {
    this.probeRing.push({ id: crypto.randomUUID(), name, ok, ms, detail, at: Date.now() })
    while (this.probeRing.length > DASH_PROBE_RING_CAP) this.probeRing.shift()
    // A faculty publishes its OWN telemetry lane (the README's pattern):
    // DASH self-test evidence lands on dash.telemetry (telemetry lane; only
    // the 'dash' faculty may subscribe).
    void this.synapse.publish({ type: 'telemetry', id: `dash.probe.${this.probeRing.length}`, selftest: name }, 'dash.telemetry')
  }

  probes(): { id: string; name: string; ok: boolean; ms: number | null; detail: string; at: number }[] {
    return this.probeRing.slice()
  }

  // --- stats @1Hz ---------------------------------------------------------------
  private pushStats(s: DashSession): void {
    if (s.closed) return
    const p90 = (arr: number[]): number | null => {
      if (arr.length === 0) return null
      const sorted = [...arr].sort((a, b) => a - b)
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.9 * sorted.length) - 1))
      return Number((sorted[idx] ?? 0).toFixed(1))
    }
    this.send(s, {
      t: 'stats',
      ttft_p90: p90(s.ttfts),
      tkr_p90: p90(s.outTps),
      completions: s.promptsSent,
      sparkline: s.tokenSparkline.slice(-60),
      // The LIVE server RSS (KB): the DASH banner's MEM cell reports the
      // SERVICE's memory footprint (process.memoryUsage().rss), not the
      // browser's JS heap (the operator-locked diagnosis of the wrong
      // subject). The web-ui no longer computes performance.memory anything.
      mem_rss_kb: Math.round(process.memoryUsage().rss / 1024),
      bus: busFlowStats(),
    })
  }

  // --- vRRM @1Hz (server-side poll; the client only renders) ---------------------
  private startVramPoll(): void {
    const poll = async (): Promise<void> => {
      if (this.stopped) return
      try {
        const ctrl = new AbortController()
        const to = setTimeout(() => ctrl.abort(), 900)
        const res = await fetch(`${VLLM_ENDPOINT}/metrics`, { signal: ctrl.signal })
        clearTimeout(to)
        if (!res.ok) throw new Error(`vllm /metrics HTTP ${res.status}`)
        const text = await res.text()
        const doneAt = Date.now()
        // vLLM's in-kernel VRAM gauges (read-only scrape; no vLLM change).
        const usedBytes =
          gaugeValue(text, 'vllm:kv_cache_usage_bytes', 'vllm:memory_used_blocks') ??
          gaugeValue(text, 'vllm:gpu_memory_utilization', 'vllm:memory_usage_bytes')
        const totalBytes = gaugeValue(text, 'vllm:memory_total_bytes')
        const mbUsed = usedBytes !== null ? Math.round((usedBytes / 1048576) * 10) / 10 : null
        const mbTotal = totalBytes !== null ? Math.round((totalBytes / 1048576) * 10) / 10 : null
        this.vramValue = { mb_used: mbUsed, mb_total: mbTotal, at: doneAt }
        this.vramErr = null
        if (mbUsed === null) throw new Error('no VRAM gauge on /metrics')
      } catch (e) {
        this.vramErr = (e as Error).message
      }
      for (const s of this.sessions.values()) {
        if (s.closed) continue
        const v = this.vramValue
        const fresh = v !== null && Date.now() - v.at <= VRAM_STALE_MS
        this.send(s, {
          t: 'vram',
          mb_used: fresh ? v.mb_used : null,
          mb_total: v ? v.mb_total : null,
          stale: !fresh,
          age_ms: v ? Date.now() - v.at : null,
          label: fresh ? `vllm /metrics @ ${DASH_VLLM_DISPLAY}` : `stale (${this.vramErr ?? 'no metrics'})`,
        })
      }
    }
    void poll()
    this.vramTimer = setInterval(() => void poll(), VRAM_POLL_MS)
    this.vramTimer.unref()
  }

  // --- session correlation tag -------------------------------------------------
  // A browser / CLI holds ONE open GET /dash (the SSE stream). Its user sends
  // ride a SEPARATE POST connection (HTTP can't multiplex a body over an
  // event-stream GET). The connect handshake tags the SSE response with
  // `s=…`; the client echoes that tag on every POST (header `X-Dash-Session`
  // or body `session`) so the server can resolve the POST back onto the
  // session that owns the stream. Minimal correlation, no redesign of the
  // route: the session still keys by the SSE GET's res; the POST just
  // carries a pointer to it.
  handleConn(tag: string, raw: string): { ok: boolean; err?: string } {
    const s = this.sessionByTag(tag)
    if (!s) return { ok: false, err: 'attach first' }
    this.handleSend(s, raw)
    return { ok: true }
  }

  private sessionByTag(tag: string): DashSession | undefined {
    if (!tag) return undefined
    for (const s of this.sessions.values()) {
      if (!s.closed && s.connTag === tag) return s
    }
    return undefined
  }

  /** public seam for the snapshot route (main.ts POST {snapshot}) — returns
   *  a structural slice so main.ts never names the private DashSession type. */
  sessionByTagPublic(tag: string): {
    boot: { moduleState: Record<string, string>; moduleMs: Record<string, number | null> }
  } | undefined {
    const s = this.sessionByTag(tag)
    if (!s) return undefined
    return {
      boot: {
        moduleState: Object.fromEntries(
          (DASH_BOOT_MODULES as DashBootModule[]).map((m) => [m, s.band.rows[m] ?? 'pending']),
        ),
        moduleMs: { ...BOOT_MS },
      },
    }
  }

  // --- user send (POST /dash) — the ONE surface the browser + CLI talk to --------
  handleSend(s: DashSession, raw: string): void {
    if (s.closed) return
    let parsed: { msg?: unknown; abort?: boolean; id?: unknown }
    try {
      parsed = JSON.parse(raw || '{}') as Record<string, unknown>
    } catch {
      // sticky proof: an invalid payload is a clean {t:'err'} frame — never a
      // crash, never sticky into the next round (each round has its own slot).
      this.send(s, { t: 'err', code: 'BAD_PAYLOAD', msg: 'invalid JSON body' })
      return
    }
    if (parsed.abort === true && typeof parsed.id === 'string') {
      void this.synapse.publish({ type: 'abort', id: parsed.id }, 'llm.abort')
      return
    }
    const msg = typeof parsed.msg === 'string' ? parsed.msg.trim() : ''
    if (msg.length === 0) {
      this.send(s, { t: 'err', code: 'EMPTY_MSG', msg: 'no message' })
      return
    }
    // CRAA (cancel-and-adopt): a user send during the ping round owns the
    // CRTX/LLM rows — the ping's slot is freed NOW (its id is reserved —
    // user ids are bare UUIDs, disjoint namespace) and the ping is aborted
    // (no sticky busy, no slot reuse, no frame cross-attribution: the
    // user's done frame can only ever carry the user's own round id).
    for (const [rid, r] of [...s.rounds.entries()]) {
      if (!rid.startsWith('boot-ping:')) continue
      if (!r.settled) {
        r.settled = true
        s.pingOpen = false
        // CRAA adopt: the user round owns the CRTX/LLM1 evidence from now
        // (REVIEW ROUND 1 FIX: latch that the user round's OK settle must
        // settle the two IMMU legs on THIS round's evidence).
        s.craaAdopted = true
        // REVIEW ROUND 2 FIX (BLOCKING): settle the IMMU legs AT THE ADOPT
        // MOMENT (not at a later user-round settle — the legs must not
        // dangle open pending a future reportDone on this ping round; that
        // was the deterministic 4s deadline FAULT + hidden-retry race).
        // The 4s IMMU budget timer STILL functions as a backstop, but a
        // healthy adopt settles here and the backstop never fires.
        //
        // ROUTING: use the IN-PROCESS IMMU API (immu.reportDone /
        // immu.reportFault), NOT synapse.publish on the bright lane —
        // the DASH faculty is NOT the publisher of `selftest.done`/
        // `selftest.fault`; only IMMU is. The lane never carries a
        // module-origin done (REVIEW ROUND 2 FIX, error #4). Errors 2 +
        // 4 are fixed by this handleSend in a single change: a direct
        // function call into the sequencer.
        const adoptMs = Date.now() - r.t0 // the in-flight boot ping's real ms (REVIEW ROUND 2: not a placeholder 0)
        this.immmu.reportDone('CRTX', adoptMs)
        this.immmu.reportDone('LLM1', adoptMs)
        this.recordProbe('CRAA-ADOPT', true, adoptMs,
          `CRAA adopt → immediate CRTX/LLM1 settle (in-flight ping ms=${adoptMs}: superseded by the user round)`
        )
      }
      s.rounds.delete(rid)
      void this.synapse.publish({ type: 'abort', id: rid }, 'llm.abort')
      this.send(s, { t: 'err', id: rid, code: 'PING_SUPERSEDED', msg: 'connect-time ping superseded by user round' })
    }
    const id = crypto.randomUUID()
    s.rounds.set(id, {
      t0: Date.now(),
      inflame: 1,
      outtoken: 0,
      reasoningFrames: 0,
      contentFrames: 0,
      firstContentAt: null,
      lastTps: null,
      usageSeen: null,
      settled: false,
      isPing: false,
    })
    s.busy = true
    // User send: echo the message only once the band is settled — during
    // boot the module rows own the tape (send mid-boot: state-only, the
    // adopt resolution still runs; the band curves the rows).
    if (s.band.settled) this.type(s, '« ' + msg + T_NL) // the user send, server-side echo
    void this.synapse.publish(
      {
        type: 'prompt',
        id,
        messages: [{ role: 'user', content: msg }],
        temperature: DEFAULT_TEMPERATURE,
        max_tokens: DEFAULT_MAX_TOKENS,
      },
      'cortex.request',
    )
  }

  // The byId surface (the telemetry snapshot path) — the TELE leg's (iv)
  // reads this over the faculty's own HTTP surface (it shares the process;
  // a localhost read is the same mechanism the web client uses).
  async telemetrySnapshot(): Promise<{ size: number } | null> {
    try {
      // SECURITY-3 / REVIEW ROUND 1 FIX: use the venue's ACTUAL listen port
      // (main.ts pins it via setListenPort after listen) — NOT the
      // hardcoded 3000. The TELE leg runs in the same process, but the HTTP
      // surface is the venue's, so the route goes out over the wire to the
      // real listener.
      const res = await fetch(this.controlBase() + '/telemetry/snapshot', {
        headers: { host: '127.0.0.1' },
        signal: AbortSignal.timeout(900),
      })
      if (!res.ok) return null
      const j = (await res.json()) as { llm?: { byId?: Record<string, unknown> } }
      return { size: Object.keys(j.llm?.byId ?? {}).length }
    } catch {
      return null
    }
  }
}

// --- helpers ---------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function gaugeValue(text: string, ...names: string[]): number | null {
  for (const n of names) {
    const re = new RegExp(`^${n.replace(/:/g, '\\:')}[ \t]+(-?[0-9.eE+]+)(?:[ \t]|$)`, 'm')
    const m = re.exec(text)
    if (m && m[1] !== undefined) {
      const v = Number(m[1])
      if (Number.isFinite(v) && v > 0) return v
    }
  }
  return null
}

async function statFsFreeBytes(path: string): Promise<number> {
  // statfs via df -B1 (no new deps; best-effort).
  const { exec } = await import('node:child_process')
  return new Promise((resolve) => {
    exec(`df -B1 --output=avail "${path}" 2>/dev/null | tail -1 | tr -d ' '`, { timeout: 2_000 }, (err, out) => {
      if (err) {
        resolve(DASH_DISK_FLOOR_BYTES + 1) // cannot measure → do not fabricate a fault
        return
      }
      const v = parseInt(out.trim(), 10)
      resolve(Number.isFinite(v) && v > 0 ? v : DASH_DISK_FLOOR_BYTES + 1)
    })
  })
}

// The DASH_IMMU_DISPLAY export (re-exported for the HUD's subject registry
// — the IMMU subject's own label; the boot sequencer is DASH's own
// bootstrap, not a sequenced bone).
export { DASH_IMMU_DISPLAY }
