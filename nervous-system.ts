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
  readonly content_tps: number | null
  readonly started_at: string
  readonly last_tick_ms: number
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
  telemetry: ['telemetry'], // only the telemetry faculty may subscribe here
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
}

function quoteText(value: unknown): string {
  const s = typeof value === 'string' ? value : ''
  return `"${s.length > 50 ? s.slice(0, 50) : s}"`
}

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
    if (p.reasoning_frame !== null && typeof p.reasoning_frame === 'string') parts.push(`reasoning_frame=${quoteText(p.reasoning_frame)}`)
    if (typeof p.content_tps === 'number') parts.push(`content_tps=${p.content_tps}`)
    if (typeof p.last_tick_ms === 'number') parts.push(`last_tick_ms=${p.last_tick_ms}`)
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
    (p.content_tps === null || p.content_tps === undefined || isFiniteNumber(p.content_tps)) &&
    (p.last_tick_ms === undefined || isFiniteNumber(p.last_tick_ms)),
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
    async darkLane(_payload: Uint8Array, _destination: string): Promise<void> {
      /* out of scope for this iteration — Spec §10 */
    },
  }
  return synapseObj as unknown as Synapse
}
