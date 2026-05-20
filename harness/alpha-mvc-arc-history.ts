import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Arc, ArcRelation } from '../schemas/arc.js'
import { createJsonlJournalWriter, readJsonlJournal } from '../nervous-system/trace/index.js'
import type { AlphaMvcHarnessResult } from './alpha-mvc.js'
import type { AlphaMvcJournalRun } from './alpha-mvc-journal.js'

export const ALPHA_MVC_ARC_HISTORY_SCHEMA = 'alpha-mvc-arc-history/v0' as const
export const DEFAULT_ALPHA_MVC_ARC_HISTORY_PATH = 'runtime/alpha-mvc/arc-history.jsonl' as const

export interface AlphaMvcArcHistoryTraceRef {
  readonly run_id: string
  readonly trace_id: string
  readonly journal_path: string
}

export interface AlphaMvcArcHistoryDebugRef {
  readonly arc_id: string
  readonly origin_hash: string
  readonly relations: readonly ArcRelation[]
}

export interface AlphaMvcArcHistoryRecord {
  readonly history_schema: typeof ALPHA_MVC_ARC_HISTORY_SCHEMA
  readonly recorded_at: number
  readonly title: string
  readonly state: Arc['state']
  readonly summary: string
  readonly created_at: number
  readonly activated_at?: number
  readonly resolved_at?: number
  readonly input: {
    readonly platform: 'discord'
    readonly channel_id: string
    readonly preview: string
    readonly length: number
  }
  readonly output: {
    readonly platform: 'discord'
    readonly channel_id: string
    readonly preview: string
    readonly length: number
  }
  readonly trace: AlphaMvcArcHistoryTraceRef
  readonly debug: AlphaMvcArcHistoryDebugRef
}

export interface AlphaMvcRecentArcItem {
  readonly handle: number
  readonly title: string
  readonly state: Arc['state']
  readonly summary: string
  readonly created_at: number
  readonly resolved_at?: number
  readonly input: AlphaMvcArcHistoryRecord['input']
  readonly output: AlphaMvcArcHistoryRecord['output']
  readonly trace?: AlphaMvcArcHistoryTraceRef
  readonly debug?: AlphaMvcArcHistoryDebugRef
}

export interface AlphaMvcRecentArcList {
  readonly recent: readonly AlphaMvcRecentArcItem[]
}

function preview(text: string, limit: number = 120): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= limit) return compact
  return `${compact.slice(0, Math.max(0, limit - 3))}...`
}

export function createAlphaMvcArcHistoryRecord(input: {
  readonly run: AlphaMvcJournalRun
  readonly result: AlphaMvcHarnessResult
  readonly now: () => number
}): AlphaMvcArcHistoryRecord {
  const arc = input.result.cortex.arc
  const originHash = input.result.cortex.trace[0]?.origin_hash ?? 'unknown-origin'
  const base = {
    history_schema: ALPHA_MVC_ARC_HISTORY_SCHEMA,
    recorded_at: input.now(),
    title: arc.title,
    state: arc.state,
    summary: arc.summary ?? arc.resolution ?? arc.target,
    created_at: arc.created_at,
    input: {
      platform: input.result.input.platform,
      channel_id: input.result.input.channel_id,
      preview: preview(input.result.input.message),
      length: input.result.input.message.length,
    },
    output: {
      platform: input.result.output.platform,
      channel_id: input.result.output.channel_id,
      preview: preview(input.result.output.content),
      length: input.result.output.content.length,
    },
    trace: {
      run_id: input.run.id,
      trace_id: input.run.trace_id,
      journal_path: input.run.journal_path,
    },
    debug: {
      arc_id: arc.id,
      origin_hash: originHash,
      relations: arc.relations,
    },
  }

  return {
    ...base,
    ...(arc.activated_at !== undefined ? { activated_at: arc.activated_at } : {}),
    ...(arc.resolved_at !== undefined ? { resolved_at: arc.resolved_at } : {}),
  }
}

export function appendAlphaMvcArcHistoryRecord(path: string, record: AlphaMvcArcHistoryRecord): void {
  const writer = createJsonlJournalWriter<AlphaMvcArcHistoryRecord>({ path })
  writer.append(record)
}

export function isAlphaMvcArcHistoryRecord(value: unknown): value is AlphaMvcArcHistoryRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.history_schema === ALPHA_MVC_ARC_HISTORY_SCHEMA
    && typeof record.recorded_at === 'number'
    && typeof record.title === 'string'
    && typeof record.state === 'string'
    && typeof record.summary === 'string'
    && typeof record.created_at === 'number'
    && typeof record.input === 'object'
    && record.input !== null
    && typeof record.output === 'object'
    && record.output !== null
    && typeof record.trace === 'object'
    && record.trace !== null
    && typeof record.debug === 'object'
    && record.debug !== null
}

export function readAlphaMvcArcHistory(path: string): readonly AlphaMvcArcHistoryRecord[] {
  if (!existsSync(path)) {
    return []
  }

  return readJsonlJournal<unknown>(path).map((entry, index) => {
    if (!isAlphaMvcArcHistoryRecord(entry)) {
      throw new Error(`Invalid Alpha MVC Arc history record at ${path}:${index + 1}`)
    }
    return entry
  })
}

export function latestAlphaMvcArcHistoryRecord(path: string): AlphaMvcArcHistoryRecord | undefined {
  const records = readAlphaMvcArcHistory(path)
  return records[records.length - 1]
}

export function listRecentAlphaMvcArcs(input: {
  readonly path: string
  readonly limit?: number
  readonly includeDebug?: boolean
}): AlphaMvcRecentArcList {
  const limit = input.limit ?? 10
  const records = readAlphaMvcArcHistory(input.path).slice(-limit).reverse()
  return {
    recent: records.map((record, index) => ({
      handle: index + 1,
      title: record.title,
      state: record.state,
      summary: record.summary,
      created_at: record.created_at,
      ...(record.resolved_at !== undefined ? { resolved_at: record.resolved_at } : {}),
      input: record.input,
      output: record.output,
      ...(input.includeDebug === true ? {
        trace: record.trace,
        debug: record.debug,
      } : {}),
    })),
  }
}

export function getRecentAlphaMvcArcByHandle(input: {
  readonly path: string
  readonly handle: number
  readonly limit?: number
}): AlphaMvcArcHistoryRecord {
  if (!Number.isInteger(input.handle) || input.handle < 1) {
    throw new Error('Recent Arc handle must be a positive integer')
  }

  const records = readAlphaMvcArcHistory(input.path).slice(-(input.limit ?? 10)).reverse()
  const record = records[input.handle - 1]
  if (record === undefined) {
    throw new Error(`Recent Arc handle not found: ${input.handle}`)
  }
  return record
}

export function defaultAlphaMvcArcHistoryPath(traceDir: string): string {
  return join(dirname(traceDir), 'arc-history.jsonl')
}
