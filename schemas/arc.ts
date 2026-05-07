export const ARC_STATES = ['OPEN', 'ACTIVE', 'DEFERRED', 'RESOLVED', 'ABSORBED'] as const

export type ArcState = typeof ARC_STATES[number]

export const ARC_TASK_STATUSES = ['PENDING', 'ACTIVE', 'BLOCKED', 'DONE', 'FAILED', 'CANCELLED'] as const

export type ArcTaskStatus = typeof ARC_TASK_STATUSES[number]

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

export interface ArcRecord {
  readonly id: string
  readonly state: ArcState
  readonly target: string
  readonly budget: ArcBudget
  readonly resource_needs: readonly string[]
  readonly tasks: readonly ArcTask[]
  readonly trace_refs: readonly string[]
  readonly resolution?: string
}

export function isArcState(value: unknown): value is ArcState {
  return typeof value === 'string' && (ARC_STATES as readonly string[]).indexOf(value) !== -1
}
