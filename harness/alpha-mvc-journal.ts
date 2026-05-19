import { basename, isAbsolute, join } from 'node:path'
import type { PersonaResponseSignal } from '../cortex/index.js'
import { readJsonlJournal } from '../nervous-system/trace/index.js'
import type { TraceEvent } from '../schemas/trace-event.js'
import type {
  AlphaMvcHarnessResult,
  AlphaMvcHarnessTraceEvent,
  FakeDiscordChatEvent,
  FakeDiscordOutput,
} from './alpha-mvc.js'

export const ALPHA_MVC_JOURNAL_SCHEMA = 'alpha-mvc-trace-journal/v0' as const
export const DEFAULT_ALPHA_MVC_TRACE_DIR = 'runtime/alpha-mvc/traces' as const

export type AlphaMvcJournalSource = 'harness' | 'cortex'

export interface AlphaMvcJournalEvent {
  readonly journal_schema: typeof ALPHA_MVC_JOURNAL_SCHEMA
  readonly run_id: string
  readonly trace_id: string
  readonly seq: number
  readonly ts: number
  readonly source: AlphaMvcJournalSource
  readonly event_type: string
  readonly boundary: string
  readonly arc_id?: string
  readonly debug: boolean
  readonly payload?: Record<string, unknown>
}

export interface AlphaMvcJournalRun {
  readonly id: string
  readonly trace_id: string
  readonly journal_path: string
  readonly debug_trace: boolean
}

export interface CreateAlphaMvcJournalRunOptions {
  readonly debugTrace?: boolean
  readonly traceDir?: string
  readonly createRunId?: () => string
  readonly createTraceId?: () => string
  readonly now?: () => number
}

export interface AlphaMvcJournalBuildOptions {
  readonly run: AlphaMvcJournalRun
  readonly result: AlphaMvcHarnessResult
  readonly now: () => number
}

export interface AlphaMvcReplaySummary {
  readonly trace_id: string
  readonly run_id: string
  readonly debug_trace: boolean
  readonly debug_available: boolean
  readonly arc_lifecycle: {
    readonly arc_id: string
    readonly states: readonly string[]
    readonly terminal_state: string
  }
  readonly input?: {
    readonly platform?: string
    readonly channel_id?: string
    readonly message?: string
  }
  readonly output?: {
    readonly platform?: string
    readonly channel_id?: string
    readonly content?: string
  }
  readonly events?: readonly AlphaMvcJournalEvent[]
}

export function createDefaultAlphaMvcId(prefix: 'run' | 'trace', now: () => number = () => Date.now()): string {
  const timestamp = new Date(now()).toISOString().replace(/[-:.]/g, '').replace('T', 'T').replace('Z', 'Z')
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${timestamp}-${random}`
}

export function createAlphaMvcJournalRun(options: CreateAlphaMvcJournalRunOptions = {}): AlphaMvcJournalRun {
  const now = options.now ?? (() => Date.now())
  const traceDir = options.traceDir ?? DEFAULT_ALPHA_MVC_TRACE_DIR
  const id = options.createRunId?.() ?? createDefaultAlphaMvcId('run', now)
  const traceId = options.createTraceId?.() ?? createDefaultAlphaMvcId('trace', now)

  return {
    id,
    trace_id: traceId,
    journal_path: join(traceDir, `${traceId}.jsonl`),
    debug_trace: options.debugTrace === true,
  }
}

export function resolveAlphaMvcJournalPath(replayTarget: string, traceDir: string = DEFAULT_ALPHA_MVC_TRACE_DIR): string {
  if (replayTarget.endsWith('.jsonl') || replayTarget.includes('/') || isAbsolute(replayTarget)) {
    return replayTarget
  }

  return join(traceDir, `${replayTarget}.jsonl`)
}

export function isAlphaMvcJournalEvent(value: unknown): value is AlphaMvcJournalEvent {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.journal_schema === ALPHA_MVC_JOURNAL_SCHEMA
    && typeof record.run_id === 'string'
    && typeof record.trace_id === 'string'
    && typeof record.seq === 'number'
    && typeof record.ts === 'number'
    && (record.source === 'harness' || record.source === 'cortex')
    && typeof record.event_type === 'string'
    && typeof record.boundary === 'string'
    && typeof record.debug === 'boolean'
}

export function readAlphaMvcJournal(path: string): readonly AlphaMvcJournalEvent[] {
  const events = readJsonlJournal<unknown>(path)
  return events.map((event, index) => {
    if (!isAlphaMvcJournalEvent(event)) {
      throw new Error(`Invalid Alpha MVC journal event at ${path}:${index + 1}`)
    }
    return event
  })
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item))
  }

  if (typeof value === 'object' && value !== null) {
    const redacted: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (/(api[_-]?key|authorization|bearer|token|secret|password|\.env|env|config)/i.test(key)) {
        redacted[key] = '[REDACTED]'
      } else {
        redacted[key] = redactSecrets(entry)
      }
    }
    return redacted
  }

  if (typeof value === 'string' && /Bearer\s+\S+/i.test(value)) {
    return value.replace(/Bearer\s+\S+/ig, 'Bearer [REDACTED]')
  }

  return value
}

function compactHarnessPayload(event: AlphaMvcHarnessTraceEvent, result: AlphaMvcHarnessResult): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    detail: event.detail,
  }

  if (event.event_type === 'FAKE_DISCORD_CHAT_RECEIVED') {
    payload.platform = result.input.platform
    payload.channel_id = result.input.channel_id
    payload.message_length = result.input.message.length
  }

  if (event.event_type === 'FAKE_DISCORD_RESPONSE_EMITTED') {
    payload.platform = result.output.platform
    payload.channel_id = result.output.channel_id
    payload.content = result.output.content
  }

  if (event.event_type === 'FAKE_MODEL_FACULTY_INVOKED') {
    payload.faculty_id = 'faculty/model/current-hermes'
  }

  return payload
}

function debugHarnessPayload(event: AlphaMvcHarnessTraceEvent, result: AlphaMvcHarnessResult): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...compactHarnessPayload(event, result),
  }

  if (event.event_type === 'FAKE_DISCORD_CHAT_RECEIVED') {
    payload.input = result.input
  }

  if (event.event_type === 'FAKE_NERVOUS_SYSTEM_RELAY_TO_CORTEX') {
    payload.origin = result.cortex.trace[0]?.origin_hash
  }

  if (event.event_type === 'FAKE_MODEL_FACULTY_INVOKED') {
    payload.invocation = {
      faculty_id: 'faculty/model/current-hermes',
      prompt: result.input.message,
      arc_id: result.cortex.arc.id,
      origin_hash: result.cortex.trace[0]?.origin_hash,
    }
  }

  if (event.event_type === 'FAKE_MODEL_FACULTY_RESULT' || event.event_type === 'FAKE_DISCORD_RESPONSE_EMITTED') {
    payload.output = result.output
  }

  if (event.event_type === 'FAKE_IRREVERSIBLE_GUARD_PROPOSAL') {
    payload.proposal_only = true
    payload.message = result.input.message
  }

  return redactSecrets(payload) as Record<string, unknown>
}

function cortexPayload(event: TraceEvent, response: PersonaResponseSignal, debug: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    faculty_id: event.faculty_id,
    schema_hash: event.schema_hash,
    origin_hash: event.origin_hash,
  }

  if (event.arc_state !== undefined) {
    payload.arc_state = event.arc_state
  }

  if (debug) {
    payload.arc = response.arc
  }

  return redactSecrets(payload) as Record<string, unknown>
}

function makeJournalEvent(input: Omit<AlphaMvcJournalEvent, 'journal_schema'>): AlphaMvcJournalEvent {
  const base = {
    journal_schema: ALPHA_MVC_JOURNAL_SCHEMA,
    run_id: input.run_id,
    trace_id: input.trace_id,
    seq: input.seq,
    ts: input.ts,
    source: input.source,
    event_type: input.event_type,
    boundary: input.boundary,
    debug: input.debug,
  }

  return {
    ...base,
    ...(input.arc_id !== undefined ? { arc_id: input.arc_id } : {}),
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
  }
}

export function createAlphaMvcJournalEvents(options: AlphaMvcJournalBuildOptions): readonly AlphaMvcJournalEvent[] {
  let seq = 0
  const events: AlphaMvcJournalEvent[] = []
  const debug = options.run.debug_trace

  for (const event of options.result.trace) {
    events.push(makeJournalEvent({
      run_id: options.run.id,
      trace_id: options.run.trace_id,
      seq: ++seq,
      ts: options.now(),
      source: 'harness',
      event_type: event.event_type,
      boundary: event.boundary,
      ...(event.arc_id !== undefined ? { arc_id: event.arc_id } : {}),
      debug,
      payload: debug ? debugHarnessPayload(event, options.result) : compactHarnessPayload(event, options.result),
    }))
  }

  for (const event of options.result.cortex.trace) {
    events.push(makeJournalEvent({
      run_id: options.run.id,
      trace_id: options.run.trace_id,
      seq: ++seq,
      ts: event.ts,
      source: 'cortex',
      event_type: event.event_type,
      boundary: 'cortex/arc-store',
      ...(event.arc_id !== null ? { arc_id: event.arc_id } : {}),
      debug,
      payload: cortexPayload(event, options.result.cortex, debug),
    }))
  }

  return events
}

export function replayAlphaMvcJournal(events: readonly AlphaMvcJournalEvent[], includeDebug: boolean = false): AlphaMvcReplaySummary {
  if (events.length === 0) {
    throw new Error('Alpha MVC journal is empty')
  }

  const first = events[0]
  if (first === undefined) {
    throw new Error('Alpha MVC journal is empty')
  }

  const lifecycle = events.filter((event) => event.source === 'cortex' && typeof event.payload?.arc_state === 'string')
  if (lifecycle.length === 0) {
    throw new Error('Alpha MVC journal contains no Cortex lifecycle events')
  }

  const arcId = lifecycle.find((event) => event.arc_id !== undefined)?.arc_id
  if (arcId === undefined) {
    throw new Error('Alpha MVC journal lifecycle has no Arc id')
  }

  const states = lifecycle.map((event) => String(event.payload?.arc_state))
  const terminalState = states[states.length - 1]
  if (terminalState === undefined) {
    throw new Error('Alpha MVC journal lifecycle has no terminal state')
  }

  const inputEvent = events.find((event) => event.event_type === 'FAKE_DISCORD_CHAT_RECEIVED')
  const outputEvent = events.find((event) => event.event_type === 'FAKE_DISCORD_RESPONSE_EMITTED')
  const debugAvailable = events.some((event) => event.debug)

  const summary: AlphaMvcReplaySummary = {
    trace_id: first.trace_id,
    run_id: first.run_id,
    debug_trace: includeDebug && debugAvailable,
    debug_available: debugAvailable,
    arc_lifecycle: {
      arc_id: arcId,
      states,
      terminal_state: terminalState,
    },
  }

  const input: {
    platform?: string
    channel_id?: string
    message?: string
  } = {
    ...(typeof inputEvent?.payload?.platform === 'string' ? { platform: inputEvent.payload.platform } : {}),
    ...(typeof inputEvent?.payload?.channel_id === 'string' ? { channel_id: inputEvent.payload.channel_id } : {}),
  }
  if (includeDebug && typeof inputEvent?.payload?.input === 'object' && inputEvent.payload.input !== null) {
    const inputPayload = inputEvent.payload.input as Partial<FakeDiscordChatEvent>
    if (typeof inputPayload.message === 'string') {
      input.message = inputPayload.message
    }
  }

  const output: AlphaMvcReplaySummary['output'] = {
    ...(typeof outputEvent?.payload?.platform === 'string' ? { platform: outputEvent.payload.platform } : {}),
    ...(typeof outputEvent?.payload?.channel_id === 'string' ? { channel_id: outputEvent.payload.channel_id } : {}),
    ...(typeof outputEvent?.payload?.content === 'string' ? { content: outputEvent.payload.content } : {}),
  }

  return {
    ...summary,
    ...(Object.keys(input).length > 0 ? { input } : {}),
    ...(Object.keys(output).length > 0 ? { output } : {}),
    ...(includeDebug ? { events } : {}),
  }
}

export function replayAlphaMvcJournalFile(path: string, includeDebug: boolean = false): AlphaMvcReplaySummary {
  return replayAlphaMvcJournal(readAlphaMvcJournal(path), includeDebug)
}

export function journalBasename(path: string): string {
  return basename(path)
}
