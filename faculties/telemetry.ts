// Telemetry faculty — READ-ONLY consumer of the telemetry lane (Spec §4/§5).
//
// Subscribes (with lane grants, the permission map on the bus enforces):
//   'llm.telemetry'   — the LLM self-accounting frames, one PER TOKEN frame
//                       as of R1 (no throttle upstream; reasoning tick,
//                       content tick, and the final done frame with usage)
//   'ns.telemetry'    — the Nervous System's own flow metrics (10 Hz; the bus
//                       granted 'ns' on the telemetry lane for exactly this
//                       observer role — the NS is read-only of itself)
//   'llm.request'     — request lifecycle (bright lane): turn ordinal, t0
//   'llm.done'        — request lifecycle (bright lane): window close; the
//                       done llm.telemetry frame (carrying vLLM usage) lands
//                       on the telemetry lane right around it and patches the
//                       already-finalized ring entry idempotently
//
// State (all in-memory, bounded):
//   - llm frame ring: last snapshot per request id + "current" pointer
//   - ns latest: last 'ns.telemetry' frame
//   - request profile ring: last 200 finalized requests (bounded).
//     Per request: {turn, input_tokens, output_tokens, reasoning_tokens,
//     content_tokens, duration_ms, ttft_ms, out_tps, tps}
//     — input/output tokens from vLLM response.completed usage (REAL field
//     names: usage.input_tokens / usage.output_tokens /
//     usage.output_tokens_details.reasoning_tokens), frame counters from the
//     llm.telemetry self-accounting, timings from llm.request→done.
//   - stats: counts over the window + mean/median/p90/p99 (nearest-rank,
//     sorted window) of ttft_ms and out_tps + since-boot counts and
//     overall throughput (tokens/min in and out). Turn = sequential request
//     index since process boot (1, 2, 3, ... — no session/arc state exists).
//
//   GET /telemetry            → SSE: integrated engine frames; /telemetry just
//                               relays whatever arrives, each tagged with its
//                               origin ('llm' per-token burst | 'ns' 10 Hz |
//                               'stats' 1 Hz). On connect: resend the last
//                               frame of each origin.
//   GET /telemetry/snapshot   → JSON: the whole engine state in one object:
//                               { llm: {current, byId}, ns, stats, flow, profiles }
//
// NO writes. Read-only by construction: it never publishes, it only listens.
// This is the data path for the dashboard arc (R2 renders the live HUD from it).
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Synapse } from '../synapse/index.js'
import type { LlmTelemetryEvent, NsTelemetryEvent, LlmRequestEvent, LlmDoneEvent } from '../nervous-system.js'
import { isAllowedHost } from './chat.js'

const PROFILE_RING_CAP = 200 // last 200 requests (bounded)
const STATS_INTERVAL_MS = 1_000 // 1 Hz 'telemetry.stats' tick

// --- request-profile ring -----------------------------------------------------
interface RequestProfile {
  turn: number // sequential request index since process boot (1, 2, 3, ...)
  id: string
  input_tokens: number // vLLM usage.input_tokens
  output_tokens: number // vLLM usage.output_tokens (completion total)
  reasoning_tokens: number // vLLM usage.output_tokens_details.reasoning_tokens
  content_tokens: number // frame count (llm telemetry self-accounting)
  duration_ms: number | null // request start (llm.request) → done
  ttft_ms: number | null // request start → first content frame (perceived latency)
  out_tps: number | null // content tokens / decode duration (first content → done)
  tps: number | null // (reasoning + content tokens) / total duration
}

interface PendingProfile {
  turn: number
  id: string
  started_at_ms: number
  first_content_at_ms: number | null
  usage: { total_input_tokens: number; total_output_tokens: number; reasoning_tokens: number } | null
  reasoning_tokens: number
  content_tokens: number
}

// --- stats --------------------------------------------------------------------
interface Stats {
  window_requests: number
  total_in: number
  total_out: number
  total_reasoning: number
  total_content: number
  ttft: { mean: number | null; median: number | null; p90: number | null; p99: number | null }
  out_tps: { mean: number | null; median: number | null; p90: number | null; p99: number | null }
  throughput_in_per_min: number
  throughput_out_per_min: number
  since_boot: { requests: number; total_in: number; total_out: number }
  active_streams: number
}

function percentileNearestRank(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  const r = Math.ceil((p / 100) * sortedAsc.length)
  const idx = Math.min(sortedAsc.length, Math.max(1, r)) - 1
  return Number((sortedAsc[idx] ?? 0).toFixed(3))
}

function quartiles(values: number[]): { mean: number | null; median: number | null; p90: number | null; p99: number | null } {
  if (values.length === 0) return { mean: null, median: null, p90: null, p99: null }
  const sorted = [...values].sort((a, b) => a - b)
  const mean = Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(3))
  const median = Number((sorted[Math.floor((sorted.length - 1) / 2)] ?? 0).toFixed(3))
  return { mean, median, p90: percentileNearestRank(sorted, 90), p99: percentileNearestRank(sorted, 99) }
}

type TelemetryFrame = LlmTelemetryEvent & { received_at?: number }

export class TelemetryFaculty {
  private synapse: Synapse
  private flowStats: () => {
    total: number
    per_lane: { bright: number; telemetry: number; dark: number }
    per_faculty: Record<string, number>
    rate_per_sec: { bright: number; telemetry: number; dark: number }
    per_second: { t: number; lanes: { bright: number; telemetry: number; dark: number } }[]
  }
  private readonly byId = new Map<string, TelemetryFrame>()
  private currentId: string | null = null
  private lastLlmFrame: TelemetryFrame | null = null
  private lastNsFrame: NsTelemetryEvent | null = null

  // request-profile state
  private readonly ring: RequestProfile[] = []
  private readonly finalized = new Set<string>()
  private readonly pending = new Map<string, PendingProfile>()
  private nextTurn = 1
  private bootstrapAt = Date.now()
  private bootedRequests = 0
  private bootedIn = 0
  private bootedOut = 0

  private readonly sseClients = new Set<ServerResponse>()

  constructor(synapse: Synapse, flowStats: () => unknown) {
    this.synapse = synapse

    const flowArg = flowStats as () => {
      total: number
      per_lane: { bright: number; telemetry: number; dark: number }
      per_faculty: Record<string, number>
      rate_per_sec: { bright: number; telemetry: number; dark: number }
      per_second: { t: number; lanes: { bright: number; telemetry: number; dark: number } }[]
    }
    this.flowStats = () => flowArg()

    this.wireSubscriptions()

    // 1 Hz stats tick → 'stats' frames on the /telemetry SSE stream.
    const iv = setInterval(() => {
      this.broadcast({ origin: 'stats', ts: Date.now(), frame: this.computeStats() })
    }, STATS_INTERVAL_MS)
    iv.unref()
  }

  // Subscriptions wired in the constructor.
  private wireSubscriptions(): void {
    // Direct subscription to the LLM telemetry frames (telemetry lane; the
    // permission map admits ONLY the 'telemetry' faculty + 'ns' there).
    // One frame PER token (R1 no throttle): step the pending profile and relay.
    this.synapse.subscribe('llm.telemetry', async (event: unknown) => {
      const snap = event as TelemetryFrame
      if (snap === null || typeof snap !== 'object') return
      if (typeof snap.id !== 'string' || snap.id.length === 0) return
      const stamped: TelemetryFrame = { ...snap, received_at: Date.now() }
      this.byId.set(snap.id, stamped)
      this.currentId = snap.id
      this.lastLlmFrame = stamped
      const p = this.pending.get(snap.id)
      const usageObj = snap.state === 'done' ? snap.usage ?? null : null
      if (p !== undefined) {
        if (typeof snap.reasoning_tokens === 'number') p.reasoning_tokens = snap.reasoning_tokens
        if (typeof snap.content_tokens === 'number') p.content_tokens = snap.content_tokens
        if (snap.state === 'content' && p.first_content_at_ms === null) p.first_content_at_ms = Date.now()
        if (usageObj !== null) p.usage = usageObj
      }
      // done frame after llm.done (ordering not guaranteed): patch the already-
      // finalized ring entry (idempotent — same values twice is a no-op delta).
      if (snap.state === 'done' && this.finalized.has(snap.id) && usageObj !== null) {
        const profile = this.ring.find((r) => r.id === snap.id)
        if (profile !== undefined) {
          this.bootedIn += usageObj.total_input_tokens - profile.input_tokens
          this.bootedOut += usageObj.total_output_tokens - profile.output_tokens
          profile.input_tokens = usageObj.total_input_tokens
          profile.output_tokens = usageObj.total_output_tokens
          profile.reasoning_tokens =
            usageObj.reasoning_tokens > 0 ? usageObj.reasoning_tokens : profile.reasoning_tokens
        }
      }
      this.broadcast({ origin: 'llm', ts: Date.now(), frame: stamped })
    }, 'telemetry')

    // NS flow frames — the bus observing its own flow (10 Hz; 'ns' is granted
    // on the telemetry lane for exactly this observer role).
    this.synapse.subscribe('ns.telemetry', async (event: unknown) => {
      const f = event as NsTelemetryEvent
      if (f === null || typeof f !== 'object') return
      this.lastNsFrame = f
      this.broadcast({ origin: 'ns', ts: Date.now(), frame: f })
    }, 'telemetry')

    // Request lifecycle (bright lane): turn ordinal at request, close at done.
    this.synapse.subscribe('llm.request', async (event: unknown) => {
      const ev = event as LlmRequestEvent
      if (ev === null || typeof ev !== 'object' || typeof ev.id !== 'string' || ev.id.length === 0) return
      if (this.pending.has(ev.id)) return
      this.pending.set(ev.id, {
        turn: this.nextTurn++,
        id: ev.id,
        started_at_ms: Date.now(),
        first_content_at_ms: null,
        usage: null,
        reasoning_tokens: 0,
        content_tokens: 0,
      })
    }, 'telemetry')

    this.synapse.subscribe('llm.done', async (event: unknown) => {
      const { id } = event as LlmDoneEvent
      const p = this.pending.get(id)
      if (p !== undefined) {
        this.finalizeProfile(p, Date.now())
      } else {
        // terminal count on the ring snapshot (ordering is not guaranteed)
        const snap = this.byId.get(id)
        if (snap !== undefined) {
          const doneSnap: TelemetryFrame = { ...snap, state: 'done' }
          this.byId.set(id, doneSnap)
          if (this.lastLlmFrame?.id === id) this.lastLlmFrame = doneSnap
          this.currentId = id
        }
      }
    }, 'telemetry')
  }

  private finalizeProfile(p: PendingProfile, nowMs: number): void {
    const duration_ms = nowMs - p.started_at_ms
    const firstContentAt = p.first_content_at_ms
    const ttft_ms = firstContentAt !== null ? firstContentAt - p.started_at_ms : null
    const decode_ms = firstContentAt !== null ? Math.max(1, nowMs - firstContentAt) : 0
    const out_tps =
      firstContentAt !== null && p.content_tokens > 0 && decode_ms > 0
        ? Number(((p.content_tokens / decode_ms) * 1000).toFixed(3))
        : null
    const tps =
      duration_ms > 0 && p.reasoning_tokens + p.content_tokens > 0
        ? Number((((p.reasoning_tokens + p.content_tokens) / duration_ms) * 1000).toFixed(3))
        : null
    const profile: RequestProfile = {
      turn: p.turn,
      id: p.id,
      input_tokens: p.usage?.total_input_tokens ?? 0,
      output_tokens: p.usage?.total_output_tokens ?? 0,
      reasoning_tokens:
        (p.usage !== null && p.usage.reasoning_tokens > 0 ? p.usage.reasoning_tokens : p.reasoning_tokens),
      content_tokens: p.content_tokens,
      duration_ms,
      ttft_ms,
      out_tps,
      tps,
    }
    this.ring.push(profile)
    while (this.ring.length > PROFILE_RING_CAP) this.ring.shift()
    this.bootedRequests += 1
    this.bootedIn += profile.input_tokens
    this.bootedOut += profile.output_tokens
    this.finalized.add(p.id)
    this.pending.delete(p.id)
    // Also: the done llm.telemetry frame may have arrived BEFORE llm.done
    // (typical ordering); its usage was captured into the pending profile if
    // we got there. If not, the done frame handler patches after finalize.
  }

  // from TelemetryFaculty.wireSubscriptions — the llm.telemetry handler step
  // patches pending profiles as frames stream (see comments there).

  // computeStats() is called from the 1 Hz ticker AND from snapshotJson() —
  // it is pure (no mutation).
  private computeStats(): Stats {
    const nowMs = Date.now()
    const sinceBootSec = Math.max(1, (nowMs - this.bootstrapAt) / 1000)
    const windowIn = this.ring.reduce((s, p) => s + p.input_tokens, 0)
    const windowOut = this.ring.reduce((s, p) => s + p.output_tokens, 0)
    const windowReasoning = this.ring.reduce((s, p) => s + p.reasoning_tokens, 0)
    const windowContent = this.ring.reduce((s, p) => s + p.content_tokens, 0)
    const ttfts = this.ring.map((p) => p.ttft_ms).filter((v): v is number => v !== null && Number.isFinite(v))
    const outTps = this.ring.map((p) => p.out_tps).filter((v): v is number => v !== null && Number.isFinite(v))
    return {
      window_requests: this.ring.length,
      total_in: windowIn,
      total_out: windowOut,
      total_reasoning: windowReasoning,
      total_content: windowContent,
      ttft: quartiles(ttfts),
      out_tps: quartiles(outTps),
      throughput_in_per_min: Number((this.bootedIn / sinceBootSec * 60).toFixed(1)),
      throughput_out_per_min: Number((this.bootedOut / sinceBootSec * 60).toFixed(1)),
      since_boot: { requests: this.bootedRequests, total_in: this.bootedIn, total_out: this.bootedOut },
      active_streams: this.pending.size,
    }
  }

  private broadcast(frame: { origin: 'llm' | 'ns' | 'stats'; ts: number; frame: unknown }): void {
    const data = `data: ${JSON.stringify(frame)}\n\n`
    for (const res of this.sseClients) {
      if (res.writableEnded) {
        this.sseClients.delete(res)
        continue
      }
      res.write(Buffer.from(data, 'utf8'))
    }
  }

  snapshotJson(): {
    llm: { current: TelemetryFrame | null; byId: Record<string, TelemetryFrame> }
    ns: NsTelemetryEvent | null
    stats: Stats
    flow: {
      total: number
      per_lane: { bright: number; telemetry: number; dark: number }
      per_faculty: Record<string, number>
      bright_per_s: number
      telemetry_per_s: number
      dark_per_s: number
      per_second: { t: number; lanes: { bright: number; telemetry: number; dark: number } }[]
    }
    profiles: RequestProfile[]
  } {
    const byId: Record<string, TelemetryFrame> = {}
    for (const [id, snap] of this.byId) byId[id] = snap
    const current = this.currentId !== null ? this.byId.get(this.currentId) ?? null : null
    const flow = this.flowStats()
    return {
      llm: { current, byId },
      ns: this.lastNsFrame,
      stats: this.computeStats(),
      flow: {
        total: flow.total,
        per_lane: flow.per_lane,
        per_faculty: flow.per_faculty,
        bright_per_s: flow.rate_per_sec.bright,
        telemetry_per_s: flow.rate_per_sec.telemetry,
        dark_per_s: flow.rate_per_sec.dark,
        per_second: flow.per_second,
      },
      // profiles: ring chronology (newest first; up to 200)
      profiles: this.ring.slice().reverse().map((p) => ({ ...p })),
    }
  }

  // Handle GET /telemetry and GET /telemetry/snapshot. Returns true if the
  // request was handled (so the caller knows not to fall through to static).
  handleRequest(req: IncomingMessage, res: ServerResponse, urlPath: string): boolean {
    if (req.method !== 'GET') return false
    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
      return true
    }
    if (urlPath === '/telemetry') {
      this.openSse(res)
      return true
    }
    if (urlPath === '/telemetry/snapshot') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(this.snapshotJson()))
      return true
    }
    return false
  }

  private openSse(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    })
    res.flushHeaders()
    this.sseClients.add(res)
    // Resend the last frame of each origin so a late opener sees engine state.
    if (this.lastLlmFrame !== null) this.broadcast({ origin: 'llm', ts: Date.now(), frame: this.lastLlmFrame })
    if (this.lastNsFrame !== null) this.broadcast({ origin: 'ns', ts: Date.now(), frame: this.lastNsFrame })
    this.broadcast({ origin: 'stats', ts: Date.now(), frame: this.computeStats() })
    res.on('close', () => {
      this.sseClients.delete(res)
    })
  }
}
