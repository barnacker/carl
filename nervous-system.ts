import { EventEmitter } from 'node:events'
import { appendFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join as pathJoin } from 'node:path'

import type { Synapse } from './synapse/index.js'

export interface PromptMessage {
  readonly role: 'user' | 'system'
  readonly content: string
}

export interface LlmTokenEvent {
  readonly type: 'token'
  readonly id: string
  readonly lane: 'content' | 'reasoning'
  readonly text: string
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
  | LlmTokenEvent
  | LlmDoneEvent
  | LlmErrorEvent
  | LlmAbortEvent
  | LlmRequestEvent
  | CortexRequestEvent
  | ChatResponseEvent

const LANE_VALUES = ['content', 'reasoning'] as const
const CHAT_RESPONSE_TYPES = ['token', 'done', 'error'] as const

// --- Bus logging (brief "Logging (MANDATORY)") ---------------------------------
// The log is an OBSERVER of the bus, never a gate: relay happens regardless of
// whether a log write lands, and log write errors are swallowed (stderr only).

const LOG_MAX_BYTES = 5 * 1024 * 1024
const LOG_ROTATIONS = 3

const CHANNEL_FROM: Record<string, string> = {
  'cortex.request': 'ChatFaculty',
  'llm.request': 'Cortex',
  'llm.token': 'LLMFACULTY',
  'llm.done': 'LLMFACULTY',
  'llm.error': 'LLMFACULTY',
  'llm.abort': 'ChatFaculty',
  'chat.response': 'Cortex',
}
const CHANNEL_TO: Record<string, string> = {
  'cortex.request': 'Cortex',
  'llm.request': 'LLMFACULTY',
  'llm.token': 'Cortex',
  'llm.done': 'Cortex',
  'llm.error': 'Cortex',
  'llm.abort': 'LLMFACULTY',
  'chat.response': 'ChatFaculty',
}

function quoteText(value: unknown): string {
  const s = typeof value === 'string' ? value : ''
  return `"${s.length > 50 ? s.slice(0, 50) : s}"`
}

function buildLogLine(channel: string, p: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof p.id === 'string') parts.push(`id=${p.id}`)
  if (channel === 'llm.token' && typeof p.lane === 'string') {
    parts.push(`lane=${p.lane}`)
    parts.push(`text=${quoteText(p.text)}`)
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
  'llm.token': (p) =>
    isRecord(p) &&
    p.type === 'token' &&
    typeof p.id === 'string' &&
    (LANE_VALUES as readonly string[]).includes(p.lane as string) &&
    typeof p.text === 'string',
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
  const synapseObj = {
    publish(event: unknown, channel?: string): Promise<void> {
      if (!isRecord(event) || typeof event['type'] !== 'string') return Promise.resolve()
      const name = channel ?? event['type']
      const validator = VALIDATORS[name]
      if (validator !== undefined && !validator(event)) {
        process.stderr.write(`synapse: rejected payload for ${name}\n`)
        return Promise.resolve()
      }
      bus.emit(name, event)
      logQueue.enqueue(buildLogLine(name, event))
      return Promise.resolve()
    },
    subscribe(eventType: string, handler: (event: unknown) => Promise<void>): void {
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
