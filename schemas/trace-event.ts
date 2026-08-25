export const TRACE_EVENT_TYPES = [
  'PUBLISH', 'SUBSCRIBE', 'DARK_LANE',
  'REFLEX_HIT', 'REFLEX_MISS', 'REFLEX_DEGRADED', 'REFLEX_BYPASS', 'REFLEX_OVERRIDE',
  'ARC_OPEN', 'ARC_ACTIVE', 'ARC_INHIBITED', 'ARC_RESOLVED', 'ARC_ABSORBED',
  'BUDGET_EXHAUSTED', 'BUDGET_EXTENDED',
  'FACULTY_HEALTHY', 'FACULTY_UNHEALTHY', 'FACULTY_ISOLATED', 'FACULTY_RECONNECTED',
  'CONFIDENCE_TRANSITION',
  'CRYSTALLIZATION', 'CRYSTALLIZATION_BLOCKED',
  'OPTIMIZATION_SWEEP', 'THRESHOLD_ADJUSTED',
  'ELEVATION', 'ELEVATION_DENIED',
  'SEB_GATE_PASSED', 'SEB_GATE_FAILED', 'SEB_PROMOTED', 'SEB_ROLLED_BACK',
  'SEMANTIC_QUERY'
] as const

export type TraceEventType = typeof TRACE_EVENT_TYPES[number]

export interface TraceEvent {
  readonly ts: number
  readonly faculty_id: string
  readonly event_type: TraceEventType
  readonly schema_hash: string
  readonly arc_id: string | null
  readonly origin_hash: string
}
