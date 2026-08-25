import type { TraceEvent, TraceEventType } from '../../schemas/trace-event.js'

type ArcLifecycleTraceEventType = Extract<TraceEventType, 'ARC_OPEN' | 'ARC_ACTIVE' | 'ARC_INHIBITED' | 'ARC_RESOLVED' | 'ARC_ABSORBED'>

export interface ReplayedArcLifecycle {
  readonly arc_id: string
  readonly origin_hash: string
  readonly event_types: readonly ArcLifecycleTraceEventType[]
  readonly terminal_event_type: ArcLifecycleTraceEventType
}

function isArcLifecycleTraceEventType(eventType: TraceEventType): eventType is ArcLifecycleTraceEventType {
  return eventType === 'ARC_OPEN'
    || eventType === 'ARC_ACTIVE'
    || eventType === 'ARC_INHIBITED'
    || eventType === 'ARC_RESOLVED'
    || eventType === 'ARC_ABSORBED'
}

export function replayArcLifecycle(trace: readonly TraceEvent[]): ReplayedArcLifecycle {
  const lifecycle = trace.filter((event) => event.arc_id !== null && isArcLifecycleTraceEventType(event.event_type))
  if (lifecycle.length === 0) {
    throw new Error('No Arc lifecycle trace events supplied')
  }

  const first = lifecycle[0]
  if (first === undefined || first.arc_id === null) {
    throw new Error('Invalid first Arc lifecycle trace event')
  }

  const eventTypes = lifecycle.map((event) => {
    if (event.arc_id !== first.arc_id) {
      throw new Error('Trace contains multiple Arc ids')
    }
    if (event.origin_hash !== first.origin_hash) {
      throw new Error('Trace contains multiple origin hashes')
    }
    if (!isArcLifecycleTraceEventType(event.event_type)) {
      throw new Error('Trace event missing Arc lifecycle event type')
    }
    return event.event_type
  })

  const terminalEventType = eventTypes[eventTypes.length - 1]
  if (terminalEventType === undefined) {
    throw new Error('Trace did not produce a terminal event')
  }

  return {
    arc_id: first.arc_id,
    origin_hash: first.origin_hash,
    event_types: eventTypes,
    terminal_event_type: terminalEventType,
  }
}
