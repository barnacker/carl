import { EventEmitter } from 'node:events'
import { appendFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join as pathJoin } from 'node:path'

import type { Synapse } from './synapse/index.js'

export interface PromptMessage {
  readonly role: 'user' | 'system'
  readonly content: string
}

export interface LlmContentTokenEvent {
  readonly type: 'token'
  readonly id: string
  readonly text: string
}

export interface LlmTelemetryEvent {
  readonly type: 'telemetry'
  readonly id: string
  readonly state: 'reasoning' | 'content' | 'done'
  readonly reasoning_tokens: number
  readonly content_tokens: number
  readonly reasoning_frame: string | null
  readonly content_frame: string | null
  // vLLM response.completed usage — real server field names (probe 2026-10-27):
  //   usage.input_tokens                        → total_input_tokens
  //   usage.output_tokens                       → total_output_tokens
  //   usage.output_tokens_details.reasoning_tokens → reasoning_tokens
  // Present on the done frame (and any frame after completion is seen).
  readonly usage?: { total_input_tokens: number; total_output_tokens: number; reasoning_tokens: number }
  readonly content_tps: number | null
  readonly started_at: string
  readonly last_tick_ms: number
}

export interface NsTelemetryEvent {
  readonly type: 'telemetry'
  readonly id: string
  readonly issued_at: string
  readonly msgs_per_sec: { bright: number; telemetry: number; dark: number }
  readonly total: number
  readonly per_faculty: Record<string, number>
}

export interface LlmDoneEvent {
  readonly type: 'done'
  readonly id: string
}

export interface LlmErrorEvent {
  readonly type: 'error'
  readonly id: string
  readonly message: string
}

export interface LlmAbortEvent {
  readonly type: 'abort'
  readonly id: string
}

export interface LlmRequestEvent {
  readonly type: 'prompt'
  readonly id: string
  readonly messages: readonly PromptMessage[]
  readonly model?: string
  readonly temperature?: number
  readonly top_p?: number
  readonly max_tokens?: number
}

export interface CortexRequestEvent {
  readonly type: 'prompt'
  readonly id: string
  readonly messages: readonly PromptMessage[]
  readonly model?: string
  readonly temperature?: number
  readonly top_p?: number
  readonly max_tokens?: number
}

export interface ChatResponseEvent {
  readonly type: 'token' | 'done' | 'error'
  readonly id: string
  readonly lane?: 'content' | 'reasoning'
  readonly text?: string
  readonly message?: string
}

export type AnyBusEvent =
  | LlmContentTokenEvent
  | LlmTelemetryEvent
  | NsTelemetryEvent
  | LlmDoneEvent
  | LlmErrorEvent
  | LlmAbortEvent
  | LlmRequestEvent
  | CortexRequestEvent
  | ChatResponseEvent

// --- Telemetry lane topology (OPERATOR-LOCKED) --------------------------------
// Every bus message carries a lane. The lane is a structural constraint on
// WHO MAY SUBSCRIBE, enforced at subscribe time (Law 11 — the mechanism ships
// its own constraint). As of this round:
//   bright    — any faculty may subscribe (the existing traffic; default lane)
//   telemetry — the telemetry faculty ONLY may subscribe
//   dark      — NOBODY may subscribe (the lane + its validation exist and are
//               empty as of now; a subscribe to it is rejected + logged)
// Reasoning text has exactly one address: the telemetry lane, inside
// llm.telemetry. No llm.reasoning.token type exists or may be created.
export type BusLane = 'bright' | 'telemetry' | 'dark'

const SUBSCRIBER_PERMISSION_MAP: Record<BusLane, string[]> = {
  bright: [], // [] = no restriction: any faculty may subscribe on 'bright'
  // 'ns' (the Nervous System itself) is granted on the telemetry lane ONLY as
  // the publisher+observer of its own flow metrics ('ns.telemetry' @ 10 Hz —
  // read-only of itself; the dashboard consumes via the telemetry faculty,
  // not as a direct subscriber). Nothing else may subscribe here.
  telemetry: ['telemetry', 'ns'],
  dark: [], // rejected: nobody may subscribe (validation exists, lane is empty)
}

// Rejects subscribe to 'dark' ALWAYS (the list is []); rejects subscribe to
// 'telemetry' for any faculty other than 'telemetry'; allows 'bright' for all.
function subscribeLaneAllowed(lane: BusLane, faculty: string): boolean {
  const allowed = SUBSCRIBER_PERMISSION_MAP[lane]
  if (lane === 'dark') return false
  if (lane === 'telemetry') return allowed.includes(faculty)
  return true // bright — any faculty
}

// lane for a given channel name; the relay uses this to stamp + validate the
// envelope on publish. llm.telemetry + any *.telemetry => 'telemetry'; the
// rest default to 'bright'.
function laneForChannel(channel: string): BusLane {
  if (channel === 'llm.telemetry' || /\.[a-z]+\.(telemetry)$/.test(channel) || channel.endsWith('.telemetry')) {
    return 'telemetry'
  }
  return 'bright'
}

const LANE_VALUES = ['content', 'reasoning'] as const // payload.lane on llm.content.token (structural, not a bus lane)
const CHAT_RESPONSE_TYPES = ['token', 'done', 'error'] as const

// --- Bus logging (brief "Logging (MANDATORY)") ---------------------------------
// The log is an OBSERVER of the bus, never a gate: relay happens regardless of
// whether a log write lands, and log write errors are swallowed (stderr only).
// Every line now carries the lane= field (telemetry lane = where reasoning text
// is logged; bright lane = everything else).

const LOG_MAX_BYTES = 5 * 1024 * 1024
const LOG_ROTATIONS = 3

const CHANNEL_FROM: Record<string, string> = {
  'cortex.request': 'ChatFaculty',
  'llm.request': 'Cortex',
  'llm.content.token': 'LLMFACULTY',
  'llm.telemetry': 'LLMFACULTY',
  'llm.done': 'LLMFACULTY',
  'llm.error': 'LLMFACULTY',
  'llm.abort': 'ChatFaculty',
  'chat.response': 'Cortex',
  'ns.telemetry': 'NervousSystem',
}
const CHANNEL_TO: Record<string, string> = {
  'cortex.request': 'Cortex',
  'llm.request': 'LLMFACULTY',
  'llm.content.token': 'Cortex',
  'llm.telemetry': 'TelemetryFaculty',
  'llm.done': 'Cortex',
  'llm.error': 'Cortex',
  'llm.abort': 'LLMFACULTY',
  'chat.response': 'ChatFaculty',
  'ns.telemetry': 'TelemetryFaculty',
}

function quoteText(value: unknown): string {
  const s = typeof value === 'string' ? value : ''
  return `"${s.length > 50 ? s.slice(0, 50) : s}"`
}

// Bus FLOW COUNTERS (R1) — the bus counts ITS OWN deliveries at the publish
// choke point (synapse.publish is the single gate through which every bus
// message enters). Counters are per-lane totals + a per-1-second delivery
// ring: each delivery is stamped with its SECONDS boundary (t = now//1000),
// and once the wall clock passes a boundary that segment becomes a fixed
// per-second artifact (never double-counted). The sampler (nsTelemetry at
// 10 Hz) reads those artifacts + the totals. Origin faculty is tagged from
// the channel's canonical from-map (bus attribution, structural).
const FLOW_PER_SECOND_CAP = 5 // artifacts retained (5s back)

export interface BusFlowStats {
  readonly total: number
  readonly per_lane: { bright: number; telemetry: number; dark: number }
  readonly per_faculty: Record<string, number>
  /** deliveries in the last completed 1-second segment (the most recent per-second artifact) */
  readonly rate_per_sec: { bright: number; telemetry: number; dark: number }
  /** completed 1-second artifacts, most recent first (up to FLOW_PER_SECOND_CAP) */
  readonly per_second: { t: number; lanes: { bright: number; telemetry: number; dark: number } }[]
}

interface FlowSecond {
  t: number
  lanes: { bright: number; telemetry: number; dark: number }
}

interface FlowCounters {
  total: number
  perLane: Record<BusLane, number>
  perFaculty: Record<string, number>
  pending: { t: number; lanes: { bright: number; telemetry: number; dark: number } } | null
  history: FlowSecond[] // fixed 1-second artifacts, most recent first
}

const flow: FlowCounters = {
  total: 0,
  perLane: { bright: 0, telemetry: 0, dark: 0 },
  perFaculty: {},
  pending: null,
  history: [],
}

function recordDelivery(lane: BusLane, faculty: string): void {
  flow.total += 1
  flow.perLane[lane] += 1
  flow.perFaculty[faculty] = (flow.perFaculty[faculty] ?? 0) + 1
  const t = Math.floor(Date.now() / 1000)
  if (flow.pending === null || flow.pending.t !== t) {
    // rollover: the current segment becomes a fixed per-second artifact
    flow.history.unshift((flow.pending ?? { t, lanes: { bright: 0, telemetry: 0, dark: 0 } }) as FlowSecond)
    while (flow.history.length > FLOW_PER_SECOND_CAP) flow.history.pop()
    flow.pending = { t, lanes: { bright: 0, telemetry: 0, dark: 0 } }
  }
  flow.pending.lanes[lane] += 1
}

export function busFlowStats(): BusFlowStats {
  const last = flow.history[0] ?? { t: Math.floor(Date.now() / 1000), lanes: { bright: 0, telemetry: 0, dark: 0 } }
  return {
    total: flow.total,
    per_lane: { ...flow.perLane },
    per_faculty: { ...flow.perFaculty },
    rate_per_sec: { ...last.lanes },
    per_second: flow.history.map((e) => ({ t: e.t, lanes: { ...e.lanes } })),
  }
}

// --- Log spam gate for *_frame text -----------------------------------------
// Counts (state/tokens/tps) log on EVERY llm.telemetry line (one line per
// published frame — and publish is now per token frame, no throttle). The
// text of *_frame rides the LOG at most once per 10 frames; the full text is
// still fully present in every published payload (this gate is about the
// append-only log file, not the bus).
const LOG_FRAME_TEXT_SAMPLE_EVERY = 10
let llmTelemetryLogSeq = 0

function buildLogLine(channel: string, p: Record<string, unknown>, lane: string): string {
  const parts: string[] = []
  if (typeof p.id === 'string') parts.push(`id=${p.id}`)
  parts.push(`lane=${lane}`)
  if (channel === 'llm.content.token' && typeof p.lane === 'string') {
    parts.push(`lane=${p.lane}`)
    parts.push(`text=${quoteText(p.text)}`)
  }
  if (channel === 'llm.telemetry') {
    if (typeof p.state === 'string') parts.push(`state=${p.state}`)
    if (typeof p.reasoning_tokens === 'number') parts.push(`reasoning_tokens=${p.reasoning_tokens}`)
    if (typeof p.content_tokens === 'number') parts.push(`content_tokens=${p.content_tokens}`)
    // Log-spam gate: frame TEXT sampled at 1/10 of frames; counts always.
    llmTelemetryLogSeq += 1
    if (llmTelemetryLogSeq % LOG_FRAME_TEXT_SAMPLE_EVERY === 0) {
      if (p.reasoning_frame !== null && typeof p.reasoning_frame === 'string') parts.push(`reasoning_frame=${quoteText(p.reasoning_frame)}`)
      if (typeof p.content_frame === 'string') parts.push(`content_frame=${quoteText(p.content_frame)}`)
    }
    if (typeof p.content_tps === 'number') parts.push(`content_tps=${p.content_tps}`)
    if (typeof p.last_tick_ms === 'number') parts.push(`last_tick_ms=${p.last_tick_ms}`)
  }
  if (channel === 'ns.telemetry') {
    const mps = p.msgs_per_sec as { bright?: unknown; telemetry?: unknown; dark?: unknown }
    if (mps && typeof mps.bright === 'number' && typeof mps.telemetry === 'number' && typeof mps.dark === 'number') {
      parts.push(`bright_per_s=${mps.bright}`)
      parts.push(`telemetry_per_s=${mps.telemetry}`)
      parts.push(`dark_per_s=${mps.dark}`)
    }
    if (typeof p.total === 'number') parts.push(`total=${p.total}`)
  }
  if (channel === 'llm.error' && typeof p.message === 'string') parts.push(`message=${quoteText(p.message)}`)
  if (channel === 'chat.response' && p.type === 'token' && typeof p.lane === 'string') {
    parts.push(`lane=${p.lane}`)
    parts.push(`text=${quoteText(p.text)}`)
  }
  if (channel === 'chat.response' && p.type === 'error' && typeof p.message === 'string') {
    parts.push(`message=${quoteText(p.message)}`)
  }
  const from = CHANNEL_FROM[channel] ?? 'unknown'
  const to = CHANNEL_TO[channel] ?? 'unknown'
  return `${new Date().toISOString()} ${channel} ${from} to=${to}${parts.length ? ' ' + parts.join(' ') : ''}`
}

async function rotateIfNeeded(logDir: string, logPath: string): Promise<void> {
  let size = 0
  try {
    size = (await stat(logPath)).size
  } catch {
    return
  }
  if (size <= LOG_MAX_BYTES) return
  try {
    const entries = (await readdir(logDir)).filter((f) => /^carl\.log\.\d+$/.test(f))
    if (entries.length >= LOG_ROTATIONS) {
      const maxNum = Math.max(...entries.map((f) => parseInt(f.slice('carl.log.'.length), 10)))
      await unlink(pathJoin(logDir, `carl.log.${maxNum}`)).catch(() => {})
      for (let i = maxNum - 1; i >= 1; i--) {
        await rename(pathJoin(logDir, `carl.log.${i}`), pathJoin(logDir, `carl.log.${i + 1}`)).catch(() => {})
      }
      await rename(logPath, pathJoin(logDir, 'carl.log.1')).catch(() => {})
    }
  } catch {
    /* rotation best-effort — never block the relay */
  }
}

function createLogQueue() {
  let logDir = ''
  let logPath = ''
  let ready = false
  let initialized = false
  let writing = false
  const queue: string[] = []

  function ensureInit(): void {
    if (initialized) return
    initialized = true
    logDir = pathJoin(process.cwd(), 'logs')
    logPath = pathJoin(logDir, 'carl.log')
    void (async () => {
      try {
        await mkdir(logDir, { recursive: true })
        ready = true
      } catch (e) {
        process.stderr.write(`carl-log: init failed: ${(e as Error).message}\n`)
      }
      void flush()
    })()
  }

  async function flush(): Promise<void> {
    if (writing) return
    writing = true
    try {
      while (queue.length > 0 && ready) {
        const line = queue.shift() as string
        try {
          await appendFile(logPath, line + '\n', 'utf8')
        } catch (e) {
          process.stderr.write(`carl-log: write failed (swallowed): ${(e as Error).message}\n`)
        }
        try {
          await rotateIfNeeded(logDir, logPath)
        } catch {
          /* best-effort */
        }
      }
    } finally {
      writing = false
    }
  }

  return {
    enqueue(line: string): void {
      ensureInit()
      queue.push(line)
      void flush()
    },
  }
}

const logQueue = createLogQueue()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPromptMessageArray(value: unknown): value is readonly PromptMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((m) => isRecord(m) && typeof m.role === 'string' && typeof m.content === 'string')
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

const VALIDATORS: Readonly<Record<string, (payload: unknown) => boolean>> = {
  'cortex.request': (p) =>
    isRecord(p) && p.type === 'prompt' && typeof p.id === 'string' && isPromptMessageArray(p.messages),
  'llm.request': (p) =>
    isRecord(p) &&
    p.type === 'prompt' &&
    typeof p.id === 'string' &&
    isPromptMessageArray(p.messages) &&
    (p.model === undefined || typeof p.model === 'string') &&
    (p.temperature === undefined || isFiniteNumber(p.temperature)) &&
    (p.top_p === undefined || isFiniteNumber(p.top_p)) &&
    (p.max_tokens === undefined || isFiniteNumber(p.max_tokens)),
  'llm.content.token': (p) =>
    isRecord(p) &&
    p.type === 'token' &&
    typeof p.id === 'string' &&
    (p.lane === undefined || (LANE_VALUES as readonly string[]).includes(p.lane as string)) &&
    typeof p.text === 'string',
  'llm.telemetry': (p) =>
    isRecord(p) &&
    p.type === 'telemetry' &&
    typeof p.id === 'string' &&
    (p.state === 'reasoning' || p.state === 'content' || p.state === 'done') &&
    (p.reasoning_tokens === undefined || isFiniteNumber(p.reasoning_tokens)) &&
    (p.content_tokens === undefined || isFiniteNumber(p.content_tokens)) &&
    (p.reasoning_frame === null || p.reasoning_frame === undefined || typeof p.reasoning_frame === 'string') &&
    (p.content_frame === null || p.content_frame === undefined || typeof p.content_frame === 'string') &&
    (p.usage === undefined ||
      (isRecord(p.usage) &&
        isFiniteNumber(p.usage.total_input_tokens) &&
        isFiniteNumber(p.usage.total_output_tokens) &&
        isFiniteNumber(p.usage.reasoning_tokens))) &&
    (p.content_tps === null || p.content_tps === undefined || isFiniteNumber(p.content_tps)) &&
    (p.last_tick_ms === undefined || isFiniteNumber(p.last_tick_ms)),
  'ns.telemetry': (p) =>
    isRecord(p) &&
    p.type === 'telemetry' &&
    isRecord(p.msgs_per_sec) &&
    isFiniteNumber(p.msgs_per_sec.bright) &&
    isFiniteNumber(p.msgs_per_sec.telemetry) &&
    isFiniteNumber(p.msgs_per_sec.dark) &&
    isFiniteNumber(p.total) &&
    isRecord(p.per_faculty) &&
    Object.values(p.per_faculty as Record<string, unknown>).every(isFiniteNumber) &&
    Array.isArray(p.per_second) &&
    (p.per_second.length === 0 ||
      (p.per_second as unknown[]).every(
        (e) => isRecord(e) && isRecord(e.lanes) && isFiniteNumber(e.lanes.bright) && isFiniteNumber(e.lanes.telemetry) && isFiniteNumber(e.lanes.dark),
      )),
  'llm.done': (p) => isRecord(p) && p.type === 'done' && typeof p.id === 'string',
  'llm.error': (p) => isRecord(p) && p.type === 'error' && typeof p.id === 'string' && typeof p.message === 'string',
  'llm.abort': (p) => isRecord(p) && p.type === 'abort' && typeof p.id === 'string',
  'chat.response': (p) =>
    isRecord(p) &&
    (typeof p.type === 'string' && (CHAT_RESPONSE_TYPES as readonly string[]).includes(p.type)) &&
    typeof p.id === 'string',
}

export class Bus {
  private readonly emitter = new EventEmitter()

  emit(event: string, payload: unknown): void {
    this.emitter.emit(event, payload)
  }

  on(event: string, listener: (payload: unknown) => void): void {
    this.emitter.on(event, listener)
  }

  off(event: string, listener: (payload: unknown) => void): void {
    this.emitter.off(event, listener)
  }
}

export function createSynapse(bus: Bus): Synapse {
  // Subscribe-time lane enforcement. The permission map is Structural — it
  // lives on the bus, not in any one faculty, so the constraint can't be
  // bypassed by a subtype. 'dark' is ALWAYS rejected (the lane exists, its
  // check exists, it is empty); 'telemetry' admits only the telemetry faculty.
  // Returns the lane for an allowed channel, or null for a rejected channel.
  const resolveRelayLane = (channel: string): BusLane | null => laneForChannel(channel)
  const resolveSubscribeLane = (channel: string, faculty: string): BusLane | null => {
    const lane = laneForChannel(channel)
    if (!subscribeLaneAllowed(lane, faculty)) {
      process.stderr.write(`synapse: rejected subscribe — faculty=${faculty} channel=${channel} lane=${lane}\n`)
      return null
    }
    return lane
  }

  const synapseObj = {
    publish(event: unknown, channel?: string): Promise<void> {
      if (!isRecord(event) || typeof event['type'] !== 'string') return Promise.resolve()
      const name = channel ?? event['type']
      const lane = resolveRelayLane(name)
      // lane is never null here (resolveRelayLane only returns null if we
      // extended it to reject; as of now it always returns a lane) but guard
      // for safety: an unknown lane is treated as a rejected publish.
      if (lane === null) {
        process.stderr.write(`synapse: rejected publish — channel=${name} lane=<unknown> (no such lane)\n`)
        logQueue.enqueue(`${new Date().toISOString()} publish ${name} REJECTED lane=unknown [no such lane]`)
        return Promise.resolve()
      }
      // Publish-time structural gate: nothing may publish on 'dark' (Lane 7 —
      // the constraint is provable at the bus boundary). Rejected publishes
      // are logged and dropped — they never reach a subscriber.
      if (lane === 'dark') {
        process.stderr.write(`synapse: rejected publish — channel=${name} lane=dark (no dark publishes allowed)\n`)
        logQueue.enqueue(`${new Date().toISOString()} publish ${name} REJECTED lane=dark [no dark publishes allowed]`)
        return Promise.resolve()
      }
      const validator = VALIDATORS[name]
      if (validator !== undefined && !validator(event)) {
        process.stderr.write(`synapse: rejected payload for ${name}\n`)
        logQueue.enqueue(`${new Date().toISOString()} publish ${name} REJECTED lane=${lane} [payload validation failed]`)
        return Promise.resolve()
      }
      bus.emit(name, event)
      recordDelivery(lane, CHANNEL_FROM[name] ?? 'unknown')
      logQueue.enqueue(buildLogLine(name, event, lane))
      return Promise.resolve()
    },
    subscribe(eventType: string, handler: (event: unknown) => Promise<void>, faculty?: string): void {
      const who = faculty ?? 'unknown'
      const lane = resolveSubscribeLane(eventType, who)
      if (lane === null) return // permission map rejected this (subscribe); already logged
      bus.on(eventType, (payload: unknown) => {
        void handler(payload).catch(() => {
          /* silent drop — Spec §4: emit with no matching listener is a no-op */
        })
      })
    },
    nsTelemetry(intervalMs: number): void {
      // NS FLOW PUBLISH — the Nervous System observes its own flow: every
      // intervalMs it publishes 'ns.telemetry' (telemetry lane) with the
      // per-lane last-1-second delivery rates (the ring's rounded 1-second
      // artifacts), the cumulative totals, and the per-origin-faculty
      // delivery counts. Dark stays 0 until a dark payload exists — it is
      // published anyway so the HUD can see the idle lane.
      const iv = setInterval(() => {
        const s = busFlowStats()
        const perSecond = s.per_second.map((e) => ({
          t: e.t,
          lanes: { bright: e.lanes.bright, telemetry: e.lanes.telemetry, dark: e.lanes.dark },
        }))
        void this.publish(
          {
            type: 'telemetry',
            id: 'ns',
            msgs_per_sec: s.rate_per_sec,
            per_second: perSecond,
            total: s.total,
            per_faculty: s.per_faculty,
          },
          'ns.telemetry',
        )
      }, intervalMs)
      iv.unref()
    },
    async darkLane(_payload: Uint8Array, _destination: string): Promise<void> {
      /* out of scope for this iteration — Spec §10 */
    },
  }
  return synapseObj as unknown as Synapse
}
