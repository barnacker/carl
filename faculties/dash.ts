import * as crypto from 'node:crypto'
import { appendFile, readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import type { Synapse } from '../synapse/index.js'
import { createBus, busFlowStats } from '../nervous-system.js'

/* BANNER-STREAM BLOCKHEAD — server-owned banner (streams as {t:'banner'} + {t:'boot'...row}); the client is a faithful renderer. */
// DASH faculty — the ONE user control surface (faculties/dash.ts).
//
// Law 2: the DASH faculty is a REAL faculty on the nervous system. It
// publishes to corners the way the old chat facade did (cortex.request,
// llm.abort) and consumes what its granted bus positions permit:
//   bright lane    : llm.content.token / llm.done / llm.error / llm.abort
//                    (the LLM faculty's request lifecycle; the old chat
//                     response relay is gone with the chat faculty)
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
//   {t:'SseInit', host, gate}   client receipt; the origin gate put this
//                               connection through (IMMU proof (i))
//   {t:'ready', ok}             attach settled; continuous stats/flow/vram
//                               begin; the per-connection self-test runs
//   {t:'boot', m, s, ms?}       self-test: m=TELE|NERV|IMMU|CRTX|LLM|DASH,
//                               s=testing|ok|fault, ms = REAL measured
//                      real measured duration on settle (6 lines; CHAT is
//                    dead with its faculty)
//
// BANNER FRAME GRAMMAR (3-line summary, the DASH faculty OWNS the banner):
//   {t:'banner', row} — a VERBATIM row the client appends (title/stats/
//                         triad/READY module placeholders); server-side
//                         text, client does not draw a template (no frame
//                         box, no client ROM/MEM calc, no client dots timer).
//   {t:'boot', m, s:'dot'|'ok'|'fault', row} — SETTLED-ROW text rides the
//                 settle frame (the client paints the row verbatim once);
//                 'dot' carries live progress (proportional fill, ≤20Hz,
//                 server-paced; the client just appends).
//   LLM→LLM1 rename is owned here (DASH_BOOT_DISPLAY: 'LLM' 4-char label);
//                 row display order DASH-first (display order array; probe
//                 execution order is unchanged — TELE→NERV→IMMU→DASH→CRTX→LLM1).
//
// Order at attach: SseInit → ready → banner rows → boot*6 (per-connection
// self-test; the connect-time micro-ping settles CRTX/LLM1) → continuous
// stats+flow+vram. The prompt tail row is appended CLIENT-side on
// {t:'banner',ready:true} so it lands directly BELOW the READY. row.
//   {t:'user', id, text}        the sent line echoes (the print transcript)
//   {t:'thinking', id}          round entered the reasoning phase (spinner)
//   {t:'reasoning', id, n}      dark lane at the RENDER boundary: the COUNT
//                               of reasoning frames so far (the raw
//                               reasoning text stays on the telemetry lane
//                               and is never rendered anywhere)
//   {t:'content', id, text}     content token (bright lane): the transcript
//   {t:'done', id, status, ms, usage, inflame, outtoken}
//                               round closed; usage = vLLM
//                               response.completed; inflame/outtoken =
//                               DASH's own frame tallies (the ±1 proof)
//   {t:'stats', ...}            @1Hz aggregate: ttft p90, tkr p90 (t/s),
//                               completions, per-frame token sparkline
//   {t:'flow', per_lane, total} @10Hz from the ns.bus monitor
//   {t:'vram', ...}             @1Hz server-side poll of the vLLM
//                               pressure endpoint (read-only; the client
//                               cannot hit vLLM directly — the gate)
//   {t:'err', id?, code, msg}   clean per-round error (not a crash, not
//                               sticky into the next round)
//
// Order at attach: SseInit → ready → boot*6 (per-connection self-test; the
// connect-time micro-ping settles CRTX/LLM) → continuous stats+flow+vram.
//
// PER-CONNECTION SELF-TEST (re-runs on EVERY /dash attach; operator rule:
// "whenever the web dashboard connects, it retriggers the self-test"):
//   TELE: (i) bus round-trip — DASH publishes a throwaway frame to its own
//         telemetry lane + confirms its OWN subscription receives it
//         (proves the fancy lane read-write); (ii) log file — append
//         'selftest.dash.<ts>' to logs/carl.log, read back the last line,
//         verify own bytes present; (iii) disk — statfs/fre of the log
//         volume, FAULT if < DASH_DISK_FLOOR_BYTES; (iv) byId ring — read
//         its own profile via the telemetry snapshot path (the bounded
//         store is live, no cap abuse — the 200 cap untouched).
//   NERV: (i) subscribe→emit→verify→unsubscribe full lifecycle on a
//         transient subscription (confirm delivery, confirm ZERO after
//         unsubscribe — proves the piping); (ii) fan-out — one publish
//         read by 2 concurrent subs, both get it (no loss, no duplicate);
//         (iii) rejection probe — attempt a subscribe to a lane DASH is not
//         entitled for → expect rejection; the rejection IS the pass.
//   IMMU: (i) this connection passed the origin gate (existence = proof);
//         (ii) spoof probe — DASH's own test client sends ONE request with
//         a forbidden Host and expects 403 (structural rejection, 403 =
//         pass); (iii) unknown-lane publish from a test publisher id →
//         rejected at the bus validation choke point.
//   CRTX: the first real message round-trip on this connection proves the
//         chain (DASH → cortex → bus → LLM → back): on attach, DASH fires
//         exactly ONE internal micro-request (a ~1-token 'ping' — cost ~a
//         dozen tokens; the operator accepts this as the price of a
//         per-connection health check) and marks CRTX OK on response + the
//         log shows the request frame (the log-grep line is the proof the
//         chain logged, not just the reply).
//   LLM:  during that same round-trip, verify BOTH frame classes observed
//         (content delta + reasoning delta when the model emits a reason
//         frame — Qwen3.8 difference: hybrid; if a ping returns no
//         reasoning the line is still OK on content+usage; no fabricated
//         reasoning test) AND usage converges: DASH tallies its own inflame
//         + outtoken count from observed frames; response.completed usage
//         must agree (±1) — mismatch = FAULT.
//   DASH: memory form — bounded per the existing dstructs: the per-
//         connection state is GC-ed on close + a 30s cap (reviewer leak #2
//         discipline); zhang (HTTP): close all SSE writers on service
//         stop, fail 3 consecutive failed frames with backoff 5*2^n capped
//         60s.
//
// FAULT semantics: a FAULT line gets ONE auto-retry after 1.5s; a second
// FAULT settles (the row header does NOT flip to PASSED). The
// timeout-budget case carries no ms suffix.
//
// BUS CONTRACT diff: chat.send / chat.response / chat.done are DROPPED
// (nothing else added). DASH talks to CORTEX (cortex.request / llm.abort),
// not to LLM directly.

// --- shared display constants (server-owned banner text) ----------------------
// The DASH faculty OWNS the banner text on the wire (the operator-locked
// stream-rewrite): the title row, rom/mem footer row, triad row, and READY.
// row are built HERE and shipped verbatim in `banner` frames — the client
// renders the stream, it does not paint a template. BANNER_VERSION moved from
// web-ui/src/lib/Chat.svelte (v0.1.1 build artifact — pre-trim) to here so the
// served frame is the single source of truth.
export const BANNER_VERSION = 'v0.1.1'
export const BANNER_TITLE = '  CARL ── PROVISIONING TERMINAL ' + BANNER_VERSION
export const BANNER_GATE_DISPLAY = 'hermes,127.0.0.1'
export const BANNER_LINK_DISPLAY = '10.240.232.32:8000'
export const BANNER_READY_ROW = '  READY.'

// The ROM value was a build-time baked constant (web-ui measure-rom.mjs). The
// server-side banner footer carries ROM from the same build artifact when it
// is readable (best-effort; the primary value on the footer is the LIVE MEM).
const BANNER_ROM_TEXT: string = (() => {
  try {
    const raw = JSON.parse(readFileSync(new URL('../web-ui/src/lib/boot-consts.json', import.meta.url), 'utf8'))
    const kb = Number(raw.romKiB ?? raw.romBytes / 1024)
    if (Number.isFinite(kb) && kb > 0) return kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb.toFixed(1) + 'KiB'
  } catch { /* best-effort */ }
  return 'n/a'
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
  return '  ROM ' + BANNER_ROM_TEXT + ' · MEM ' + bannerMemText()
}
export const BANNER_TRIAD_ROW = '  GATE hermes,127.0.0.1 · LINK 10.240.232.32:8000'

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
const DASH_LEG_TIMEOUT_MS = 15_000 // per-leg probe budget (the timeout case)
const DASH_RETRY_AFTER_MS = 1_500 // ONE auto-retry after 1.5s on FAULT
// ── Duct margin cadence constants (server-driven dot animation) ──────────
// The dot field is FIXED at 12 dots (BANNER_DOT_COUNT) — the display width
// does not stretch. What varies per leg is how many dots land DURING the leg
// and how fast: the server paces each dot frame at a rate that tracks the
// leg's real progress (elapsed vs the leg's own timeout budget), capped at
// ~25 Hz so the SSE stream stays small. On settle the row shows the FULL 12
// dots + status (the row's final text is the single source of truth).
const BANNER_DOT_COUNT = 12
const BANNER_DOT_TICK_MS = 50 // dot probe cadence ≤ 20 Hz (operator-cap)
// Per-module expected leg duration (used to pace dots: a fast DASH/IMMU
// probe lands fewer dots in 50ms; a slow TELE disk readback lands more).
// These are approximations of the real leg cost; the dots still adapt to the
// actual probe, not a fixed timer — the budget is only the pacing ceiling.
const DASH_LEG_BUDGET_MS: Record<DashBootModule, number> = {
  DASH: 50, TELE: 200, NERV: 50, IMMU: 100, CRTX: 500, LLM1: 800,
}
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
const DASH_LLM_LEG_MAX_TRIES = 4
const BIRTH_LINE_MAX = 64

export type DashBootModule = 'TELE' | 'NERV' | 'IMMU' | 'DASH' | 'CRTX' | 'LLM1'
export const DASH_BOOT_MODULES: readonly DashBootModule[] = ['TELE', 'NERV', 'IMMU', 'CRTX', 'LLM1', 'DASH']
// BANNER ROW ORDER — operator-locked display row order (DASH first; it is the
// surface: connection + gate + NS proof). Each row's label is 4 chars wide
// (LLM's display label is 'LLM1' — the rename is owned by this map, not the
// client). The probe execution order below is UNCHANGED (TELE→NERV→IMMU→DASH
// then CRTX/LLM via the ping round).
export const DASH_BOOT_DISPLAY: Record<DashBootModule, string> = {
  DASH: 'DASH', TELE: 'TELE', NERV: 'NERV', IMMU: 'IMMU', CRTX: 'CRTX', LLM1: 'LLM1',
}
// Fixed display row order for the banner. The probe execution order below is
// unchanged (TELE→NERV→IMMU→DASH then CRTX/LLM via the ping round) — this is
// purely a display-order lookup the client uses to map module→row slot.
export const DASH_BOOT_DISPLAY_ORDER: readonly DashBootModule[] = ['DASH', 'TELE', 'NERV', 'IMMU', 'CRTX', 'LLM1']

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

// ── Banner row state (server-owned, per-module) ───────────────────────────
// Each module's banner row is tracked as the server streams dots, then
// settled on the probe's outcome. The client renders the row VERBATIM
// (xterm.write); the server is the single source of truth for the text.
interface BannerRowState {
  label: string          // 4-char display label (e.g. 'DASH', 'TELE', 'LLM1')
  dots: number           // 0..12 (BANNER_DOT_COUNT); live=progress, settled=12
  status: string         // '…' | 'PING' | 'OK' | 'FAULT' | 'RETRY'
  suffix: string         // ' * NNms' (ok) | ' — <detail>' (fault)
  settled: boolean
}
function initModuleRow(module: DashBootModule): BannerRowState {
  return { label: DASH_BOOT_DISPLAY[module], dots: 0, status: '…', suffix: '', settled: false }
}
// One module row as RAW TEXT (the stream is the transcript, not a template):
//   '  > ' + label(4) + ' ' + dots(12) + ' ' + status.padEnd(5) + suffix
// Settled rows carry the full 12-dot field and ' * NNms' or ' — <detail>'.
// The client `write()`s this verbatim into its xterm buffer (no column
// math, no padding to screen width — single-width only in the row text).
function formatBannerRow(r: BannerRowState): string {
  const dots = '.'.repeat(r.dots) + ' '.repeat(BANNER_DOT_COUNT - r.dots)
  return '  > ' + r.label.padEnd(4) + ' ' + dots + ' ' + r.status.padEnd(5) + r.suffix
}

interface DashBoot {
  moduleState: Record<DashBootModule, 'testing' | 'ok' | 'fault' | 'pending' | 'retry' | 'done-fault' | 'done-ok'>
  moduleMs: Record<DashBootModule, number | null>
  // Per-module banner row state (label + dots + status + suffix). The server
  // drives the dot animation live; `finishModule` settles the row to its final
  // text (the client renders verbatim — no client-side template).
  bannerRows: Map<DashBootModule, BannerRowState>
  // The self-test header row (gated on all 6 done-*) flips once, server-side.
  headerRow: BannerRowState
  // Dot-pacing: the row's dot budget (elapsed-tick counter) + unref'd tick iv.
  dotTicks: Record<DashBootModule, number>
  dotIvs: { [k in DashBootModule]?: NodeJS.Timeout }
  settled: boolean
  roundT0: number | null
  onRoundSettled: ((status: 'ok' | 'fail', ms: number, r: DashRound | null) => void) | null
  llmTries: number
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
  boot: DashBoot
  ttfts: number[]
  outTps: number[]
  tokenSparkline: { t: number; in: number; out: number }[]
  promptsSent: number
  busy: boolean
  tickTimers: NodeJS.Timeout[]
  tickLastFrame: number
  birthLineCount: number
}

export class DASHFaculty {
  private readonly synapse: Synapse
  private readonly bus: ReturnType<typeof createBus>
  private readonly sessions = new Map<string, DashSession>()
  private readonly probeRing: { id: string; name: string; ok: boolean; ms: number | null; detail: string; at: number }[] = []
  private vramTimer: NodeJS.Timeout | null = null
  private vramValue: { mb_used: number | null; mb_total: number | null; at: number } | null = null
  private vramErr: string | null = null
  private stopped = false

  constructor(synapse: Synapse) {
    this.synapse = synapse
    this.bus = createBus()
    this.wire()
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
        this.send(s, { t: 'content', id: f.id, text: typeof f.text === 'string' ? f.text : '' })
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
          // The dark lane at the render boundary: the frame carries the
          // COUNT only; the raw reasoning text stays on the telemetry lane
          // and is never rendered anywhere (the DASH faculty holds the HOLD).
          this.send(s, { t: 'thinking', id: f.id })
          this.send(s, { t: 'reasoning', id: f.id, n: r.reasoningFrames })
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
            // The round's own usage frame RE-OPENS the LLM row when an adopted
            // ping closed it 'fault' (no usage existed for the ping): a user
            // round carrying real usage IS the LLM row's actual test — it
            // re-settles below (trySettleLlmLeg), flipping FAULT → OK.
            if (s.boot.moduleState.LLM1 === 'fault' || s.boot.moduleState.LLM1 === 'testing') {
              s.boot.moduleState.LLM1 = 'testing'
            }
            this.trySettleLlmLeg(s, r)
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
      boot: {
        // CRTX + LLM pre-exist as PENDING (not 'testing') at attach: their line is
        // only drawn/painted WITH the frame once a round is actually being run
        // and settled (their tests cannot fail in the same sense as the four
        // structural legs — they are waiting on the model). The four structural
        // legs (TELE/NERV/IMMU/DASH) test immediately.
        moduleState: { TELE: 'testing', NERV: 'testing', IMMU: 'testing', DASH: 'testing', CRTX: 'pending', LLM1: 'pending' },
        moduleMs: { TELE: null, NERV: null, IMMU: null, DASH: null, CRTX: null, LLM1: null },
        bannerRows: new Map(),
        headerRow: { label: '', dots: 0, status: '…', suffix: '', settled: false },
        dotTicks: { TELE: 0, NERV: 0, IMMU: 0, DASH: 0, CRTX: 0, LLM1: 0 },
        dotIvs: {},
        settled: false,
        roundT0: null,
        onRoundSettled: null,
        llmTries: 0,
      },
      ttfts: [],
      outTps: [],
      tokenSparkline: [],
      promptsSent: 0,
      busy: false,
      tickTimers: [],
      tickLastFrame: Date.now(),
      birthLineCount: BIRTH_LINE_MAX,
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

    // Attach order: SseInit → ready → banner rows (server-owned; the client
    // renders them verbatim, no client-side template) → boot self-test.
    this.send(s, { t: 'sseinit', session: id, tag: s.connTag, host, gate: [...DASH_GATE_HOSTS] })
    this.send(s, { t: 'ready', ok: true })
    this.streamBanner(s)

    // The per-connection self-test re-triggers on EVERY /dash attach.
    void this.runPerConnectionSelfTest(s)

    // Continuous ticks from ready onward (independent of chat activity).
    const statsIv = setInterval(() => this.pushStats(s), STATS_POLL_MS)
    statsIv.unref()
    s.tickTimers.push(statsIv)
    return s
  }

  private detachSession(s: DashSession, reason: string): void {
    if (s.closed) return
    s.closed = true
    this.sessions.delete(s.id)
    for (const iv of s.tickTimers) clearInterval(iv)
    // The dot pingers are unref'd + tick-capped, but clear them here anyway
    // (belt-and-braces against a session that closes before a leg settles).
    for (const m of DASH_BOOT_MODULES) this.stopDotTimer(s, m)
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
          (Object.keys(s.boot.moduleState) as DashBootModule[]).map((m) => [
            m,
            { state: s.boot.moduleState[m], ms: s.boot.moduleMs[m] },
          ]),
        ),
      })),
      probes: this.probeRing.slice(-24),
    }
  }

  // --- the wire (zhang backoff: 3 consecutive failed frames → 5*2^n capped
  // --- 60s; a writer that resumes after the backoff keeps working) ----------
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
    // zeroing the streak (the resume-on-live-writer half was already
    // correct and is untouched).
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
    this.send(s, {
      t: 'done',
      id,
      status,
      ms,
      usage: r.usageSeen ? { ...r.usageSeen } : null,
      inflame: r.inflame, // observed input-frame tally (DASH counts its own)
      outtoken: r.outtoken, // own tally: observed output frames (±1 vs usage)
    })
    if (s.boot.onRoundSettled !== null) {
      const cb = s.boot.onRoundSettled
      s.boot.onRoundSettled = null
      cb(status === 'ok' ? 'ok' : 'fail', ms, r)
    }
  }

  // LLM leg: both frame classes + usage convergence (±1). Settled when the
  // done llm.telemetry frame (carrying usage) has landed AND the round has
  // closed; a backstop retries on each post-telemetry settle (≤ DASH_LLM_
  // LEG_MAX_TRIES). A HARD timeout also settle-faults it so a stuck model can't
  // leave the header open: the header must flip by ≤ DASH_LLM_LEASE_MS from
  // the round starting (the header itself gates on all 6 rows).
  private trySettleLlmLeg(s: DashSession, r: DashRound): void {
    if (s.boot.moduleState.LLM1 !== 'testing' && s.boot.moduleState.LLM1 !== 'pending') return
    s.boot.llmTries += 1
    if (r.settled) this.finishLlmLeg(s, r)
    else if (s.boot.llmTries >= DASH_LLM_LEG_MAX_TRIES) {
      this.finishModule(s, 'LLM1', false, 0, 'LLM leg timeout (usage frame never settled the round)')
    }
  }

  // Hard-fail the LLM leg on a per-session timer — the *header* must flip even
  // if vLLM is unreachable/slow. The round itself settles independently (the
  // round settle path owns its own `done` frame and onRoundSettled); this just
  // makes sure the BOOT doesn't hang.
  private startLlmLease(s: DashSession): void {
    const t = setTimeout(() => {
      const st = s.boot.moduleState.LLM1
      if (st === 'testing' || st === 'pending') {
        // If we haven't settled, check whether any content has arrived yet.
        const anySettled = s.boot.moduleState.LLM1 !== 'testing'
        if (!anySettled) {
          this.finishModule(s, 'LLM1', false, 0, `LLM busy-timeout: no usage/content within ${this.leaseSawMiscount()}ms lease (vLLM unreachable or stuck on this connection's first round)`)
        }
      }
      this.maybeSettleHeader(s)
    }, this.leaseMs())
    t.unref()
    s.tickTimers.push(t)
  }
  private leaseMs(): number {
    return 45_000 // hard F-TFAIL ceiling on the LLM leg per connection
  }
  private leaseSawMiscount(): number { return this.leaseMs() }

  private finishLlmLeg(s: DashSession, r: DashRound): void {
    const sawContent = r.contentFrames > 0
    const sawReasoning = r.reasoningFrames > 0 // Qwen3.8 hybrid: 0 is OK
    const u = r.usageSeen
    let ok = sawContent
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
    } else if (sawContent && r.settled) {
      // no usage frame on a CLOSED content round: structural mismatch.
      ok = false
      mis.push('no usage frame on closed content round')
    }
    const detail = ok
      ? `content=${r.contentFrames} reasoning=${sawReasoning ? r.reasoningFrames : 0}${u ? ` usage=${u.input_tokens}/${u.output_tokens}/${u.reasoning_tokens} conv=ok` : ''}`
      : mis.join('; ')
    this.finishModule(s, 'LLM1', ok, s.boot.roundT0 !== null ? Date.now() - s.boot.roundT0 : 0, detail)
  }

  // --- the per-connection self-test (re-runs on EVERY /dash attach) --------------
  // NOTE: the client is a FAITHFUL renderer of the stream — it appends the
  // rows the server sends, verbatim. The server OWNS the display text:
  //   rows are streamed in DASH_BOOT_DISPLAY_ORDER (DASH first) via
  //   `streamBanner`; module cells are streamed character-by-character (dot
  //   frames `{t:'boot','m','s':'dot','n'}` live, then the settle frame
  //   `{t:'boot','m','s':'ok'|'fault'}` carries the full settled row, dots
  //   padded to 12, either ' * <N>ms' (ok) or ' — <detail>' (fault next
  //   attempt)).
  private async runPerConnectionSelfTest(s: DashSession): Promise<void> {
    const leg = (name: DashBootModule, probe: () => Promise<{ ok: boolean; ms: number; detail: string }>): void => {
      this.send(s, { t: 'boot', m: name, s: 'testing' })
      this.send(s, { t: 'banner', row: this.bannerRowLive(s.boot, name) })
      this.startDotTimer(s, name)
      void (async () => {
        const t0 = Date.now()
        let res: { ok: boolean; ms: number; detail: string }
        try {
          res = await withTimeout(probe(), DASH_LEG_TIMEOUT_MS, { ok: false, ms: DASH_LEG_TIMEOUT_MS, detail: 'leg-timeout' })
        } catch (e) {
          res = { ok: false, ms: Date.now() - t0, detail: (e as Error).message }
        }
        this.finishModule(s, name, res.ok, res.ms, res.detail)
      })()
    }

    // TELE -----------------------------------------------------------------
    leg('TELE', async () => {
      const t0 = Date.now()
      // (i) bus round-trip: throwaway frame on DASH's OWN telemetry lane,
      // confirmed on DASH's own subscription (fancy lane read-write).
      const chan = 'dash.telemetry.selftest'
      let got = 0
      const h = (): void => {
        got += 1
      }
      this.bus.on(chan, h)
      await this.synapse.publish({ type: 'telemetry', id: `dash.rt.${Date.now()}`, selftest: true }, chan)
      await sleep(30)
      this.bus.off(chan, h)
      if (got !== 1) return { ok: false, ms: Date.now() - t0, detail: `bus round-trip ${got}/1` }
      // (ii) log file: append + read back own bytes.
      const logRel = process.env.DASH_SELFTEST_LOG ?? 'logs/carl.log'
      const tag = `selftest.dash.${Date.now()}.${s.id.slice(0, 8)}`
      try {
        await appendFile(logRel, new Date().toISOString() + ' dash.selftest ' + tag + '\n', 'utf8' as never)
      } catch (e) {
        return { ok: false, ms: Date.now() - t0, detail: `log append: ${(e as Error).message}` }
      }
      await sleep(20)
      let last = ''
      try {
        const raw = readFileSync(logRel, 'utf8')
        const lines = raw.split('\n').filter((l) => l.length > 0)
        last = lines.slice(-50).join('\n')
      } catch (e) {
        return { ok: false, ms: Date.now() - t0, detail: `log readback: ${(e as Error).message}` }
      }
      if (!last.includes(tag)) return { ok: false, ms: Date.now() - t0, detail: 'log readback: own tag not in last 50 lines' }
      // (iii) disk: statfs of the log volume.
      const free = await statFsFreeBytes(logRel)
      if (free < DASH_DISK_FLOOR_BYTES) {
        return { ok: false, ms: Date.now() - t0, detail: `disk free ${Math.round(free / 1048576)}MB < floor ${DASH_DISK_FLOOR_BYTES / 1048576}MB` }
      }
      // (iv) byId ring: read its own profile via the telemetry snapshot path
      // (the bounded store is live, no cap abuse — the 200 cap untouched).
      const snap = await this.telemetrySnapshot()
      if (snap === null) return { ok: false, ms: Date.now() - t0, detail: 'telemetry snapshot unreachable' }
      return { ok: true, ms: Date.now() - t0, detail: `rt=1 log=yes disk=${Math.round(free / 1048576)}MB byId=${snap.size}` }
    })

    // NERV -----------------------------------------------------------------
    leg('NERV', async () => {
      const t0 = Date.now()
      // (i) subscribe→emit→verify→unsubscribe on a transient subscription.
      const ch = 'dash.test.lifecycle'
      const seen: unknown[] = []
      const h = (ev: unknown): void => {
        seen.push(ev)
      }
      this.bus.on(ch, h)
      this.bus.emit(ch, { id: 'pre' })
      await sleep(5)
      if (seen.length !== 1) {
        this.bus.off(ch, h)
        return { ok: false, ms: Date.now() - t0, detail: `subscribe->emit ${seen.length}/1` }
      }
      this.bus.off(ch, h) // unsubscribe
      this.bus.emit(ch, { id: 'post' })
      await sleep(5)
      if (seen.length !== 1) return { ok: false, ms: Date.now() - t0, detail: 'delivery after unsubscribe (piping leak)' }
      // (ii) fan-out: one publish, 2 concurrent subs, both get it.
      const fch = 'dash.test.fanout'
      const a: unknown[] = []
      const b: unknown[] = []
      const ha = (ev: unknown): void => {
        a.push(ev)
      }
      const hb = (ev: unknown): void => {
        b.push(ev)
      }
      this.bus.on(fch, ha)
      this.bus.on(fch, hb)
      this.bus.emit(fch, { id: 'fan' })
      await sleep(5)
      this.bus.off(fch, ha)
      this.bus.off(fch, hb)
      if (a.length !== 1 || b.length !== 1) {
        return { ok: false, ms: Date.now() - t0, detail: `fan-out a=${a.length} b=${b.length} (want 1,1)` }
      }
      // (iii) rejection probe: a lane DASH is not entitled for → expect
      // rejection; the rejection IS the pass.
      const darkSeen: unknown[] = []
      this.synapse.subscribe('dash.test.darklane', () => {
        darkSeen.push('x')
        return Promise.resolve()
      }, 'dash')
      await sleep(20)
      const rejected = darkSeen.length === 0
      if (!rejected) return { ok: false, ms: Date.now() - t0, detail: 'rejection: the dark lane accepted a subscribe (gate broken)' }
      // (iii-b) validator choke point: publish a malformed payload to
      // 'llm.done' — the validator rejects it (same choke point as
      // llm.content.token). The rejection happens BEFORE bus.emit (the
      // validator runs first in synapse.publish), so no listener on
      // 'llm.done' ever sees the bad frame — the probe is structurally
      // neutral to the live wire() relay. We still subscribe + unsub to
      // prove the subscribe/unsub lifecycle on the channel (and to confirm
      // the bad frame never leaks through a live listener).
      let badSeen = 0
      const badH = (ev: unknown): void => {
        const p = ev as { id?: string }
        if (p && p.id === 'immutest-bad') badSeen += 1
      }
      this.bus.on('llm.done', badH)
      await this.synapse.publish({ type: 'not-a-done', id: 'immutest-bad' }, 'llm.done')
      await sleep(20)
      this.bus.off('llm.done', badH)
      if (badSeen !== 0) return { ok: false, ms: Date.now() - t0, detail: 'validator reject did not hold (bad llm.done frame reached a listener)' }
      return { ok: true, ms: Date.now() - t0, detail: 'lifecycle + fan-out 2sub + dark-reject + validator-reject (llm.done)' }
    })

    // IMMU -----------------------------------------------------------------
    leg('IMMU', async () => {
      const t0 = Date.now()
      // (i) origin gate: this connection passed it (existence = proof).
      if (!s.res.headersSent) return { ok: false, ms: Date.now() - t0, detail: 'attach never flushed (gate path)' }
      // (ii) spoof probe: ONE request with a forbidden Host → expect 403.
      const code = await getWithHost('http://127.0.0.1:3000/', 'evil.example.com')
      if (code !== 403) return { ok: false, ms: Date.now() - t0, detail: `spoof host returned ${code} (want 403)` }
      return { ok: true, ms: Date.now() - t0, detail: 'gate-exist + spoof-403' }
    })

    // DASH (memory form) ----------------------------------------------------
    leg('DASH', async () => {
      const t0 = Date.now()
      // memory bounded per dstructs: per-connection state GC-on-close + 30s
      // cap; no unbounded timers (all timers are per-session, cleared on
      // detach; the probe ring is capped).
      if (this.probeRing.length > DASH_PROBE_RING_CAP) {
        return { ok: false, ms: Date.now() - t0, detail: `probe ring over cap ${this.probeRing.length}` }
      }
      if (DASH_CONN_IDLE_CAP_MS !== 30_000) return { ok: false, ms: Date.now() - t0, detail: 'idle cap drifted' }
      // zhang (HTTP): writers healthy (no fail streak), backoff logic armed.
      if (s.failStreak >= DASH_SSE_FAIL_LIMIT) return { ok: false, ms: Date.now() - t0, detail: `writer failStreak=${s.failStreak}` }
      return { ok: true, ms: Date.now() - t0, detail: `ring=${this.probeRing.length}/${DASH_PROBE_RING_CAP} idle-cap=30s zhang=armed` }
    })

    // CRTX + LLM ---------------------------------------------------------------
    // Seed the two round-dependent rows as `pending` (already set above). We
    // do NOT send a `boot testing` frame for them here — the client draws
    // them as the pending line (dotted) until CRTX/LLM get a 'testing' frame
    // (which only happens once a round actually starts and settles). This is
    // the shipped boot shape: four probes run immediately, two round-rows are
    // 'pending' placeholders that fill once the model proves the chain.
    s.boot.roundT0 = Date.now()
    // The ping's round id lives in a RESERVED namespace ('boot-ping:<uuid>').
    // User round ids are bare UUIDs (crypto.randomUUID) — the namespaces are
    // disjoint by construction, so the frame router can never attribute a user
    // round's frames to the ping slot (or vice versa): after the adopt/cancel
    // resolution, the user sees only their own round id's frames.
    const pingId = 'boot-ping:' + crypto.randomUUID()
    s.rounds.set(pingId, {
      t0: Date.now(),
      inflame: 2,
      outtoken: 0,
      reasoningFrames: 0,
      contentFrames: 0,
      firstContentAt: null,
      lastTps: null,
      usageSeen: null,
      settled: false,
      isPing: true,
    })
    this.startLlmLease(s)
    // The ping IS the CRTX/LLM test (the ping row makes the round evidence legible):
    // the moment it is issued the rows flip to 'pinging' {t:'boot', m, s:'ping',
    // id} — a very visible line (the client draws 'PING' + a 12-dot pending
    // field), NOT the bare 'pending' placeholder. The ping id rides the frame
    // so the client can watch exactly this round on the line. They settle from
    // the round itself (done llm.telemetry + round settle → 'ok'/'fault').
    // The ping is SETTING-UP for the CRTX/LLM rows, not testing them: the rows
    // read 'pending' until a round (ping or user) proves them; the 'ping' boot
    // frame tells the client which id to watch on those rows.
    s.boot.moduleState.CRTX = 'pending'
    s.boot.moduleState.LLM1 = 'pending'
    this.send(s, { t: 'boot', m: 'CRTX', s: 'ping', id: pingId })
    this.send(s, { t: 'boot', m: 'LLM1', s: 'ping', id: pingId })
    this.send(s, { t: 'banner', row: this.bannerRowLive(s.boot, 'CRTX') })
    this.startDotTimer(s, 'CRTX')
    this.send(s, { t: 'banner', row: this.bannerRowLive(s.boot, 'LLM1') })
    this.startDotTimer(s, 'LLM1')
    s.boot.onRoundSettled = (status: 'ok' | 'fail', ms: number, r: DashRound | null) => {
      this.finishModule(
        s,
        'CRTX',
        status === 'ok',
        ms,
        status === 'ok'
          ? 'round-trip DASH→cortex→bus→LLM→back (request frame logged: cortex.request | to Cortex)'
          : `round closed ${status}`,
      )
      if (status === 'ok' && r === null && s.boot.moduleState.LLM1 === 'testing') {
        // the round froze before its usage frame could land — the LLM leg
        // keeps waiting for a later settle (trySettleLlmLeg backstop).
      }
      this.maybeSettleHeader(s)
    }
    void this.synapse.publish(
      {
        type: 'prompt',
        id: pingId,
        messages: [
          { role: 'system', content: 'Reply with a single word: pong' },
          { role: 'user', content: PING_PROMPT },
        ],
        temperature: 0.1,
        max_tokens: PING_MAX_TOKENS,
      },
      'cortex.request',
    )
  }

  // --- module line settlement (one auto-retry after 1.5s; second FAULT settles)
  // The streamed row text (the settle frame's `row`) is the CLIENT'S final
  // paint for this row — dots padded to 12, status + ' * <ms>' (ok) or
  // ' — <detail>' (fault). The dots-grow animation lives in `startDotTimer`
  // (server-paced, progress-capped by the leg's timeout budget).
  private finishModule(s: DashSession, name: DashBootModule, ok: boolean, ms: number, detail: string): void {
    if (s.closed) return
    const st = s.boot.moduleState[name]
    if (st === 'done-ok' || st === 'done-fault') return
    this.stopDotTimer(s, name)
    this.recordProbe(name, ok, ok ? ms : null, detail)
    if (ok) {
      s.boot.moduleState[name] = 'done-ok'
      s.boot.moduleMs[name] = Math.max(0, Math.round(ms))
      this.settleRow(s, name, true, s.boot.moduleMs[name])
      this.send(s, { t: 'boot', m: name, s: 'ok', ms: s.boot.moduleMs[name], row: this.bannerRowSettled(s, name) })
    } else if (st === 'fault') {
      // a second FAULT settles — the header does NOT flip to PASSED.
      s.boot.moduleState[name] = 'done-fault'
      this.settleRow(s, name, false, detail)
      this.send(s, { t: 'boot', m: name, s: 'fault', detail, row: this.bannerRowSettled(s, name) })
    } else {
      // first FAULT: show FAULT + ONE auto-retry after 1.5s.
      s.boot.moduleState[name] = 'fault'
      this.settleRow(s, name, false, detail)
      this.send(s, { t: 'boot', m: name, s: 'fault', detail, row: this.bannerRowSettled(s, name) })
      const retry = this.legProbeFor(name)
      const iv = setTimeout(() => {
        if (s.closed || s.boot.moduleState[name] !== 'fault') return
        s.boot.moduleState[name] = 'testing'
        // Re-enter the live row (the retry animates its own row: fresh dots).
        this.send(s, { t: 'boot', m: name, s: 'testing', row: this.bannerRowLive(s.boot, name) })
        this.startDotTimer(s, name)
        void (async () => {
          if (!retry) {
            // CRTX/LLM: the retry re-settles from the round's tallies (a real
            // retry — same event that settles them, when it lands).
            const rr = [...s.rounds.values()].find((x) => !x.settled) ?? null
            if (rr) {
              if (name === 'LLM1') this.finishLlmLeg(s, rr)
              else this.finishModule(s, 'CRTX', rr.firstContentAt !== null, Date.now() - (s.boot.roundT0 ?? rr.t0), 'retry: round state')
            } else {
              s.boot.moduleState[name] = 'done-fault'
              this.settleRow(s, name, false, 'retry: no round state')
              this.send(s, { t: 'boot', m: name, s: 'fault', detail: 'retry: no round state', row: this.bannerRowSettled(s, name) })
              this.maybeSettleHeader(s)
            }
          } else {
            const t0 = Date.now()
            let res: { ok: boolean; ms: number; detail: string }
            try {
              res = await withTimeout(retry(), DASH_LEG_TIMEOUT_MS, { ok: false, ms: DASH_LEG_TIMEOUT_MS, detail: 'retry-timeout' })
            } catch (e) {
              res = { ok: false, ms: Date.now() - t0, detail: (e as Error).message }
            }
            if (res.ok) {
              s.boot.moduleState[name] = 'done-ok'
              s.boot.moduleMs[name] = Math.max(0, Math.round(res.ms))
              this.recordProbe(`${name}(retry)`, true, res.ms, res.detail)
              this.settleRow(s, name, true, s.boot.moduleMs[name])
              this.send(s, { t: 'boot', m: name, s: 'ok', ms: s.boot.moduleMs[name], row: this.bannerRowSettled(s, name) })
            } else {
              s.boot.moduleState[name] = 'done-fault'
              this.recordProbe(`${name}(retry)`, false, null, res.detail)
              this.settleRow(s, name, false, res.detail)
              this.send(s, { t: 'boot', m: name, s: 'fault', detail: res.detail, row: this.bannerRowSettled(s, name) })
            }
            this.maybeSettleHeader(s)
          }
        })()
      }, DASH_RETRY_AFTER_MS)
      iv.unref()
      s.tickTimers.push(iv)
    }
    this.maybeSettleHeader(s)
  }

  /** the retryable probe bodies (a real retry, not cosmetic) */
  private legProbeFor(name: DashBootModule): (() => Promise<{ ok: boolean; ms: number; detail: string }>) | null {
    switch (name) {
      case 'TELE':
        return async () => {
          const t0 = Date.now()
          const chan = 'dash.telemetry.selftest.retry'
          let got = 0
          const h = (): void => {
            got += 1
          }
          this.bus.on(chan, h)
          await this.synapse.publish({ type: 'telemetry', id: `dash.rt2.${Date.now()}`, selftest: true }, chan)
          await sleep(30)
          this.bus.off(chan, h)
          return got === 1
            ? { ok: true, ms: Date.now() - t0, detail: 'bus round-trip (retry)' }
            : { ok: false, ms: Date.now() - t0, detail: `bus rt retry ${got}/1` }
        }
      case 'NERV':
        return async () => {
          const t0 = Date.now()
          const ch = 'dash.test.lifecycle.retry'
          let got = 0
          const h = (): void => {
            got += 1
          }
          this.bus.on(ch, h)
          this.bus.emit(ch, { id: 'r' })
          await sleep(5)
          this.bus.off(ch, h)
          return got === 1
            ? { ok: true, ms: Date.now() - t0, detail: 'lifecycle (retry)' }
            : { ok: false, ms: Date.now() - t0, detail: `lifecycle retry ${got}/1` }
        }
      case 'IMMU':
        return async () => {
          const t0 = Date.now()
          const code = await getWithHost('http://127.0.0.1:3000/', 'evil.example.com')
          return code === 403
            ? { ok: true, ms: Date.now() - t0, detail: 'spoof 403 (retry)' }
            : { ok: false, ms: Date.now() - t0, detail: `spoof ${code} (retry)` }
        }
      case 'DASH':
        return async () => {
          const t0 = Date.now()
          return { ok: this.probeRing.length <= DASH_PROBE_RING_CAP, ms: Date.now() - t0, detail: 'bounded memory (retry)' }
        }
      default:
        return null // CRTX/LLM settle from the round itself
    }
  }

  private maybeSettleHeader(s: DashSession): void {
    if (s.boot.settled) return
    if (!Object.values(s.boot.moduleState).every((v) => v === 'done-ok' || v === 'done-fault')) return
    s.boot.settled = true
    // Stop any still-open dot pingers (belt-and-braces: finishModule stops
    // its own; this is for the row that never got a settle — e.g. the session
    // is closing in the same tick).
    for (const m of DASH_BOOT_MODULES) this.stopDotTimer(s, m)
    const anyFault = Object.values(s.boot.moduleState).some((v) => v === 'done-fault')
    // THE BANNER TAIL — server-emitted verbatim text, this is the last few
    // rows the client appends (still no client-side template for the banner):
    //   stats footer (ROM + MEM=server RSS) → triad row → blank → READY. row.
    // The prompt tail row is appended client-side on the NEXT frame (the
    // `banner` `ready` signal — see attachSession) — the composer lands
    // directly below the READY. row (operator-locked: no template, no order).
    // Footers/triads/READY tail circuits: each line streams character-by-character
    // (same as the title); the partials repaint the cursor line in-place, the final frame is the linefeed.
    this.streamRowChars(s, bannerStatsRow())
    this.streamRowChars(s, BANNER_TRIAD_ROW)
    this.streamRowChars(s, this.bannerRowLiveHeader(anyFault))
    this.streamRowChars(s, BANNER_READY_ROW)
    this.send(s, { t: 'banner', ready: true })
    this.send(s, { t: 'boot', m: 'SELFTEST', s: anyFault ? 'fault' : 'ok' })
    this.recordProbe('SELFTEST', !anyFault, null, anyFault ? 'FAULT — header did not flip to PASSED' : 'PASSED — all 6 modules ok')
  }

  // --- banner streaming (the server OWNS the banner text) --------------------
  // The client is a FAITHFUL renderer: it appends the server's rows in order,
  // verbatim, and the module rows are animated by the server's dot frames.
  // Frame grammar (see the header comment for the full table):
  //   {t:'banner', row: string}        — one verbatim row (+ \n) the client
  //                                       appends to its xterm buffer. Order
  //                               is the banner shape (title → footer → …).
  //                                      The client does not pad any of these
  //                                      lines; the row is shown as-is.
  //   {t:'banner', ready: true}        — tail of the banner; the client
  //                                       appends the prompt tail row here.
  //   {t:'boot', m, s:'dot', n:<number>, row: string} — dot animation
  //                                       (n = dots drawn so far, row =
  //                                       the full live row). One frame
  //                                       per dot-change (≤20 Hz per row).
  //   {t:'boot', m, s:'ok'|'fault', …, row: string} — the SETTLED row text
  //                                       (definitive paint; replaces dot
  //                                       animation). The client does NOT
  //                                       re-draw the row once settled
  //                                       (the settled row is permanent).
  // The streaming is paced on the leg's own timeout budget (not a per-dot
  // constant timer): a fast leg lands few dots, a slow leg lands more. This
  // is the operator's "variable dot count + speed, server-paced, client just
  // appends" spec.
  // The 6 module rows are seeded in DASH_BOOT_MODULES order (the RUN order:
  // TELE→NERV→IMMU→DASH then CRTX/LLM1), and the client paints them in
  // DASH_BOOT_DISPLAY_ORDER (DASH first) via a fixed row-index map — the
  // server's probe execution order is UNCHANGED (hard rule).
  streamBanner(s: DashSession): void {
    // Title + SELF-TEST header — server-emitted verbatim rows, streamed
    // CHARACTER-BY-CHARACTER (operator lock): each row is sent as growing
    // partial frames (one frame every ~30ms, ≤ 25Hz) — the client writes each
    // partial verbatim at its recorded cursor row (in-place, no re-append),
    // and the FINAL frame (partial:false) carries the full row + the
    // linefeed. Module seed rows are the exception: they are sent as ONE
    // full-row frame (m-tagged) so the client's CUP-repaint map (abs-y of the
    // seed append) is exactly what the dot/settle frames address.
    // The probe EXECUTION order is unchanged (TELE→NERV→IMMU→DASH immedi-
    // ate, CRTX/LLM1 via the ping round) — only the DISPLAY is DASH-first.
    this.streamRowChars(s, BANNER_TITLE)
    this.streamRowChars(s, 'SELF-TEST …' + '─'.repeat(30))
    for (const m of DASH_BOOT_DISPLAY_ORDER) {
      const row = initModuleRow(m)
      s.boot.bannerRows.set(m, row)
      this.send(s, { t: 'banner', row: formatBannerRow(row), m })
    }
  }
  // Character-by-character row streaming (the banner's title + SELF-TEST
  // header + tail rows). Cadence: ~30ms between partial frames (≤ ~33Hz,
  // well under the SSE burst ceiling); a row of N chars lands in
  // ceil(N*30/20) partials — the title (~38 chars) ≈ 1.1s, SELF-TEST (~40)
  // ≈ 1.1s, the tail rows ~0.4s each. The writes queue on the same SSE
  // socket (sync loop) — the CADENCE is the client's render pace (xterm
  // redraws per frame); if the socket lags, frames coalesce and the row
  // simply completes faster (never drops: each frame is the growing prefix
  // of the FINAL frame, which is the truth).
  private streamRowChars(s: DashSession, text: string): void {
    const delayMs = 30
    const frames: number[] = []
    for (let i = 1; i < text.length; i++) frames.push(i)
    for (const i of frames) {
      this.send(s, { t: 'banner', row: text.slice(0, i), partial: true })
      const t = Date.now()
      while (Date.now() - t < delayMs) { /* busy wait — bounded by row length */ }
    }
    this.send(s, { t: 'banner', row: text, partial: false })
  }

  // A module's row as RAW TEXT in its live (un-settled) state — '…' status,
  // dots as currently accumulated by the dot pinger.
  private bannerRowLive(state: DashBoot, name: DashBootModule): string {
    const row = state.bannerRows.get(name)
    if (!row) return formatBannerRow(initModuleRow(name))
    if (!row.settled) row.status = state.moduleState[name] === 'pending' ? '…' : 'PING'
    return formatBannerRow(row)
  }
  // Same, but the header row (after all done-*, the status flips to PASSED/FAULT).
  private bannerRowLiveHeader(anyFault: boolean): string {
    return 'SELF-TEST ' + (anyFault ? '… FAULT' : '… PASSED')
  }
  // The settled row (12 dots + status + suffix) — the single source of truth
  // on the SETTLE frame (the client does not re-draw it once settled).
  private bannerRowSettled(s: DashSession, name: DashBootModule): string {
    const row = s.boot.bannerRows.get(name) ?? null
    return row ? formatBannerRow(row) : ''
  }
  // Flip the row state to settled (dots→12, status+suffix set); the client
  // gets the row text via the settle frame (see finishModule).
  private settleRow(s: DashSession, name: DashBootModule, ok: boolean, info: number | string): void {
    const row = s.boot.bannerRows.get(name)
    if (!row) return
    row.settled = true
    row.dots = BANNER_DOT_COUNT
    if (ok) {
      row.status = 'OK'
      row.suffix = ' * ' + String(Math.max(0, Math.round(info as number))).padStart(2, '0') + 'ms'
    } else {
      row.status = 'FAULT'
      row.suffix = ' \u2014 ' + (info as string)
    }
  }
  // Dot pinger — OPERATOR FINAL SHAPE: the dots fill PROPORTIONALLY to the
  // leg's real progress (elapsed vs the leg's expected budget), at a tick
  // rate capped ≤ 20 Hz. A fast leg (DASH 50ms) lands 1-2 dots before settle;
  // a slow leg (TELE 200ms, LLM1 ping 800ms) keeps filling toward 12. On
  // settle (finishModule) the row's dots are padded to the FULL 12 in the
  // settled row text — the animation's remainder is never painted (the settled
  // text is the single source of truth). One unref'd interval per module;
  // `dotTicks` holds the elapsed-tick counter for the proportional fill.
  private startDotTimer(s: DashSession, name: DashBootModule): void {
    const existing = s.boot.dotIvs[name]
    if (existing) clearInterval(existing)
    const row = s.boot.bannerRows.get(name)
    if (!row) return
    row.settled = false
    row.dots = 0
    const t0 = Date.now()
    const budget = DASH_LEG_BUDGET_MS[name]
    const iv = setInterval(() => {
      if (row.settled || s.closed) { this.stopDotTimer(s, name); return }
      const st = s.boot.moduleState[name]
      if (st === 'fault' || st === 'done-ok' || st === 'done-fault') { this.stopDotTimer(s, name); return }
      // Proportional fill: denominator = max(elapsed, small floor) so the
      // first tick lands ~1 dot and the field fills smoothly over `budget`.
      const elapsed = Date.now() - t0
      const denom = Math.max(elapsed, Math.max(60, budget / 6))
      const want = Math.min(BANNER_DOT_COUNT, Math.floor((elapsed / denom) * BANNER_DOT_COUNT) + 1)
      if (want > row.dots) {
        row.dots = want
        row.status = st === 'pending' ? '…' : 'PING'
        this.send(s, { t: 'boot', m: name, s: 'dot', n: row.dots, row: formatBannerRow(row) })
      }
    }, BANNER_DOT_TICK_MS)
    iv.unref()
    s.boot.dotIvs[name] = iv
  }
  private stopDotTimer(s: DashSession, name: DashBootModule): void {
    const iv = s.boot.dotIvs[name]
    if (iv) { clearInterval(iv); delete s.boot.dotIvs[name] }
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
    return this.sessionByTag(tag)
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
    // NATIONAL RULE (one line): the user send is CANCEL-AND-ADOPT — whichever
    // of (ping settle, user send) lands first wins, and the event that lands
    // second adopts the first's resolution instead of colliding with it:
    //   • if the ping is still in flight when the user sends, the USER round
    //     owns the CRTX/LLM rows: the ping's slot is freed NOW (reserved
    //     'boot-ping:' id — user ids are bare UUIDs, disjoint namespace) and
    //     the ping is aborted (no sticky busy, no slot reuse, no frame
    //     cross-attribution: the user's done frame can only ever carry the
    //     user's own round id).
    //   • if the ping already settled, the boot rows are frozen and the user
    //     round simply runs; its done carries the user id, full stop.
    // Zero visible latency for the fast sender — the send is NEVER blocked on
    // boot; it just cancels the ping when that is the race.
    if (s.boot.roundT0 !== null) {
      for (const [rid, r] of [...s.rounds.entries()]) {
        if (!rid.startsWith('boot-ping:')) continue
        const wasOpen = !r.settled
        if (wasOpen) r.settled = true
        s.boot.onRoundSettled = null
        s.rounds.delete(rid)
        void this.synapse.publish({ type: 'abort', id: rid }, 'llm.abort')
        this.send(s, { t: 'err', id: rid, code: 'PING_SUPERSEDED', msg: 'connect-time ping superseded by user round' })
        // The cancel IS the ping's terminal frame: close the boot rows it was
        // feeding (its settle hook is gone). CRTX → pending (the adopting
        // user round proves it when it settles); LLM → fault (no usage came
        // for the ping — a user round's own usage re-opens it, see (i)).
        if (wasOpen) {
          this.send(s, { t: 'boot', m: 'CRTX', s: 'pending', id: rid })
          this.send(s, { t: 'boot', m: 'LLM1', s: 'fault', id: rid })
        }
      }
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
    if (s.boot.roundT0 === null) s.boot.roundT0 = Date.now()
    // A user round now owns the CRTX/LLM rows (cancel-and-adopt resolution):
    // re-wire the settle hook if it is not already the ping's (the ping's own
    // hook settles the rows when the ping is the winner — see the ping round
    // setup above).
    if (s.boot.onRoundSettled === null) {
      s.boot.onRoundSettled = (status: 'ok' | 'fail', ms: number, r: DashRound | null) => {
        this.finishModule(s, 'CRTX', status === 'ok', ms, status === 'ok' ? 'user round DASH→cortex→bus→LLM→back' : `round ${status}`)
        this.maybeSettleHeader(s)
      }
    }
    this.send(s, { t: 'user', id, text: msg })
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
      const res = await fetch('http://127.0.0.1:3000/telemetry/snapshot', {
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

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

function gaugeValue(text: string, ...names: string[]): number | null {
  for (const n of names) {
    const re = new RegExp(`^${n.replace(/:/g, '\\:')}[ \\t]+(-?[0-9.eE+]+)(?:[ \\t]|$)`, 'm')
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

function getWithHost(url: string, host: string): Promise<number> {
  return new Promise((resolve) => {
    import('node:http')
      .then((http) => {
        const u = new URL(url)
        const req = http.request(
          {
            host: u.hostname,
            port: u.port || 3000,
            method: 'GET',
            path: u.pathname,
            headers: { host },
            timeout: 2_000,
          },
          (res) => {
            res.resume()
            res.on('end', () => resolve(res.statusCode ?? 0))
          },
        )
        req.on('error', () => resolve(0))
        req.on('timeout', () => {
          req.destroy()
          resolve(0)
        })
        req.end()
      })
      .catch(() => resolve(0))
  })
}
