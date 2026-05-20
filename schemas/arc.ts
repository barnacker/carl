export const ARC_STATES = ['OPEN', 'ACTIVE', 'DEFERRED', 'RESOLVED', 'ABSORBED'] as const

export type ArcState = typeof ARC_STATES[number]

export const ARC_TASK_STATUSES = ['PENDING', 'ACTIVE', 'BLOCKED', 'DONE', 'FAILED', 'CANCELLED'] as const

export type ArcTaskStatus = typeof ARC_TASK_STATUSES[number]

export const ARC_RELATION_DIMENSIONS = [
  'CHRONOLOGY',
  'TOPIC',
  'INTENT',
  'WORKFLOW',
  'DERIVATION',
  'CONFLICT',
  'DUPLICATION',
  'REFERENCE',
  'CAUSALITY',
] as const

export type ArcRelationDimension = typeof ARC_RELATION_DIMENSIONS[number]

export const ARC_RELATION_TYPES = [
  'PREVIOUS',
  'NEXT',
  'RELATED_TOPIC',
  'FOLLOWS_UP',
  'SUPERSEDES',
  'SUPERSEDED_BY',
  'ABSORBS',
  'ABSORBED_BY',
  'FORKED_FROM',
  'PRODUCED',
] as const

export type ArcRelationType = typeof ARC_RELATION_TYPES[number]

export const ARC_RELATION_AUTHORS = ['CORTEX', 'OPERATOR', 'FACULTY'] as const

export type ArcRelationAuthor = typeof ARC_RELATION_AUTHORS[number]

export interface ArcRelationProvenance {
  readonly author: ArcRelationAuthor
  readonly faculty_id?: string
  readonly evidence_refs: readonly string[]
}

export interface ArcRelation {
  readonly dimension: ArcRelationDimension
  readonly relation_type: ArcRelationType
  readonly target_arc_id: string
  readonly direction: 'OUTGOING' | 'INCOMING' | 'UNDIRECTED'
  readonly reason?: string
  readonly topic?: string
  readonly strength?: number
  readonly confidence?: number
  readonly provenance: ArcRelationProvenance
  readonly created_at: number
}

export interface ArcBudget {
  readonly max_model_calls: number
  readonly max_faculty_dispatches: number
  readonly max_wall_time_ms: number
}

export interface ArcTask {
  readonly id: string
  readonly instruction: string
  readonly status: ArcTaskStatus
  readonly result?: string
}

export interface Arc {
  readonly id: string
  readonly title: string
  readonly state: ArcState
  readonly target: string
  readonly summary?: string
  readonly created_at: number
  readonly activated_at?: number
  readonly resolved_at?: number
  readonly budget: ArcBudget
  readonly resource_needs: readonly string[]
  readonly tasks: readonly ArcTask[]
  readonly trace_refs: readonly string[]
  readonly relations: readonly ArcRelation[]
  readonly resolution?: string
}

/** @deprecated Use Arc. Kept as a compatibility alias while Alpha MVC callers migrate. */
export type ArcRecord = Arc

export function isArcState(value: unknown): value is ArcState {
  return typeof value === 'string' && (ARC_STATES as readonly string[]).indexOf(value) !== -1
}

export function isArcRelationDimension(value: unknown): value is ArcRelationDimension {
  return typeof value === 'string' && (ARC_RELATION_DIMENSIONS as readonly string[]).includes(value)
}

export function isArcRelationType(value: unknown): value is ArcRelationType {
  return typeof value === 'string' && (ARC_RELATION_TYPES as readonly string[]).includes(value)
}
