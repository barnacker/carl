import type { Arc, ArcBudget, ArcRelation } from '../schemas/arc.js'
import type { OriginStamp } from '../schemas/origin-stamp.js'
import type { TraceEvent, TraceEventType } from '../schemas/trace-event.js'

export const arcStoreBoundary = 'arc-store' as const

export interface ArcIndexEntry {
  readonly id: string
  readonly title: string
  readonly state: Arc['state']
  readonly target: string
  readonly summary: string
  readonly created_at: number
  readonly resolved_at?: number
}

export interface ArcStoreMutation {
  readonly arc: Arc
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

export interface CreateArcTitleInput {
  readonly target: string
}

export interface ArcStoreDependencies {
  readonly createArcId?: () => string
  readonly createArcTitle?: (input: CreateArcTitleInput) => string
  readonly previousArcId?: string
  readonly now?: () => number
}

export interface ArcStore {
  openArc(input: OpenArcInput): ArcStoreMutation
  activateArc(input: TransitionArcInput): ArcStoreMutation
  resolveArc(input: ResolveArcInput): ArcStoreMutation
  listArcIndex(): readonly ArcIndexEntry[]
  getArc(arcId: string): Arc | undefined
}

const ARC_SCHEMA_HASH = 'cortex-arc/v2'
const ARC_STORE_FACULTY_ID = 'cortex/arc-store'

const DEFAULT_BUDGET: ArcBudget = {
  max_model_calls: 0,
  max_faculty_dispatches: 0,
  max_wall_time_ms: 0,
}

export function createDeterministicArcTitle(input: CreateArcTitleInput): string {
  const words = input.target
    .replace(/[`*_#>\[\](){}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)

  const title = words.slice(0, 8).join(' ')
  if (title.length === 0) {
    return 'Untitled Arc'
  }

  return title.length > 80 ? `${title.slice(0, 77)}...` : title
}

function createResolutionSummary(resolution: string): string {
  const compact = resolution.replace(/\s+/g, ' ').trim()
  if (compact.length === 0) {
    return 'Resolved with empty output.'
  }
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact
}

export function createArcStore(dependencies: ArcStoreDependencies = {}): ArcStore {
  const arcs = new Map<string, Arc>()
  const createArcId = dependencies.createArcId ?? (() => `arc-${arcs.size + 1}`)
  const createArcTitle = dependencies.createArcTitle ?? createDeterministicArcTitle
  const now = dependencies.now ?? (() => Date.now())

  const createTrace = (
    event_type: Extract<TraceEventType, 'ARC_OPEN' | 'ARC_ACTIVE' | 'ARC_RESOLVED'>,
    arc: Arc,
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

  const store = (arc: Arc): Arc => {
    arcs.set(arc.id, arc)
    return arc
  }

  const createInitialRelations = (createdAt: number): readonly ArcRelation[] => {
    if (dependencies.previousArcId === undefined) {
      return []
    }

    return [{
      dimension: 'CHRONOLOGY',
      relation_type: 'PREVIOUS',
      target_arc_id: dependencies.previousArcId,
      direction: 'OUTGOING',
      reason: 'Immediately preceding Arc in local Alpha MVC history.',
      provenance: {
        author: 'CORTEX',
        evidence_refs: [],
      },
      created_at: createdAt,
    }]
  }

  return {
    openArc(input: OpenArcInput): ArcStoreMutation {
      const createdAt = now()
      const arc = store({
        id: createArcId(),
        title: createArcTitle({ target: input.target }),
        state: 'OPEN',
        target: input.target,
        summary: input.target,
        created_at: createdAt,
        budget: {
          ...DEFAULT_BUDGET,
          ...input.budget,
        },
        resource_needs: input.resourceNeeds ?? [],
        tasks: [],
        trace_refs: ['ARC_OPEN'],
        relations: createInitialRelations(createdAt),
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
        activated_at: now(),
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
        summary: createResolutionSummary(input.resolution),
        resolved_at: now(),
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
        title: arc.title,
        state: arc.state,
        target: arc.target,
        summary: arc.summary ?? arc.target,
        created_at: arc.created_at,
        ...(arc.resolved_at !== undefined ? { resolved_at: arc.resolved_at } : {}),
      }))
    },

    getArc(arcId: string): Arc | undefined {
      return arcs.get(arcId)
    },
  }
}
