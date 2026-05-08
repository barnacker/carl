import type { ArcBudget, ArcRecord } from '../../schemas/arc.js'
import type { OriginStamp } from '../../schemas/origin-stamp.js'
import type { TraceEvent, TraceEventType } from '../../schemas/trace-event.js'

export const arcStoreBoundary = 'arc-store' as const

export interface ArcIndexEntry {
  readonly id: string
  readonly state: ArcRecord['state']
  readonly target: string
  readonly summary: string
}

export interface ArcStoreMutation {
  readonly arc: ArcRecord
  readonly trace: TraceEvent
}

export interface OpenArcInput {
  readonly target: string
  readonly origin: OriginStamp
  readonly resourceNeeds?: readonly string[]
  readonly budget?: Partial<ArcBudget>
}

export interface TransitionArcInput {
  readonly arcId: string
  readonly origin: OriginStamp
}

export interface ResolveArcInput extends TransitionArcInput {
  readonly resolution: string
}

export interface ArcStoreDependencies {
  readonly createArcId?: () => string
  readonly now?: () => number
}

export interface ArcStore {
  openArc(input: OpenArcInput): ArcStoreMutation
  activateArc(input: TransitionArcInput): ArcStoreMutation
  resolveArc(input: ResolveArcInput): ArcStoreMutation
  listArcIndex(): readonly ArcIndexEntry[]
  getArc(arcId: string): ArcRecord | undefined
}

const ARC_SCHEMA_HASH = 'cortex-arc/v1'
const ARC_STORE_FACULTY_ID = 'cortex/arc-store'

const DEFAULT_BUDGET: ArcBudget = {
  max_model_calls: 0,
  max_faculty_dispatches: 0,
  max_wall_time_ms: 0,
}

export function createArcStore(dependencies: ArcStoreDependencies = {}): ArcStore {
  const arcs = new Map<string, ArcRecord>()
  const createArcId = dependencies.createArcId ?? (() => `arc-${arcs.size + 1}`)
  const now = dependencies.now ?? (() => Date.now())

  const createTrace = (
    event_type: Extract<TraceEventType, 'ARC_OPEN' | 'ARC_ACTIVE' | 'ARC_RESOLVED'>,
    arc: ArcRecord,
    origin: OriginStamp,
  ): TraceEvent => ({
    ts: now(),
    faculty_id: ARC_STORE_FACULTY_ID,
    event_type,
    schema_hash: ARC_SCHEMA_HASH,
    arc_id: arc.id,
    origin_hash: origin.signature_hash,
    arc_state: arc.state,
  })

  const store = (arc: ArcRecord): ArcRecord => {
    arcs.set(arc.id, arc)
    return arc
  }

  return {
    openArc(input: OpenArcInput): ArcStoreMutation {
      const arc = store({
        id: createArcId(),
        state: 'OPEN',
        target: input.target,
        budget: {
          ...DEFAULT_BUDGET,
          ...input.budget,
        },
        resource_needs: input.resourceNeeds ?? [],
        tasks: [],
        trace_refs: ['ARC_OPEN'],
      })

      return {
        arc,
        trace: createTrace('ARC_OPEN', arc, input.origin),
      }
    },

    activateArc(input: TransitionArcInput): ArcStoreMutation {
      const existing = arcs.get(input.arcId)
      if (existing === undefined) {
        throw new Error(`Arc not found: ${input.arcId}`)
      }

      const arc = store({
        ...existing,
        state: 'ACTIVE',
        trace_refs: [...existing.trace_refs, 'ARC_ACTIVE'],
      })

      return {
        arc,
        trace: createTrace('ARC_ACTIVE', arc, input.origin),
      }
    },

    resolveArc(input: ResolveArcInput): ArcStoreMutation {
      const existing = arcs.get(input.arcId)
      if (existing === undefined) {
        throw new Error(`Arc not found: ${input.arcId}`)
      }

      const arc = store({
        ...existing,
        state: 'RESOLVED',
        resolution: input.resolution,
        trace_refs: [...existing.trace_refs, 'ARC_RESOLVED'],
      })

      return {
        arc,
        trace: createTrace('ARC_RESOLVED', arc, input.origin),
      }
    },

    listArcIndex(): readonly ArcIndexEntry[] {
      return Array.from(arcs.values()).map((arc) => ({
        id: arc.id,
        state: arc.state,
        target: arc.target,
        summary: arc.target,
      }))
    },

    getArc(arcId: string): ArcRecord | undefined {
      return arcs.get(arcId)
    },
  }
}
