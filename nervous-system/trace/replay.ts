import type { ArcState } from '../../schemas/arc.js'
import type { TraceEvent } from '../../schemas/trace-event.js'

export interface ReplayedArcLifecycle {
  readonly arc_id: string
  readonly origin_hash: string
  readonly states: readonly ArcState[]
  readonly terminal_state: ArcState
}

export function replayArcLifecycle(trace: readonly TraceEvent[]): ReplayedArcLifecycle {
  const lifecycle = trace.filter((event) => event.arc_id !== null && event.arc_state !== undefined)
  if (lifecycle.length === 0) {
    throw new Error('No Arc lifecycle trace events supplied')
  }

  const first = lifecycle[0]
  if (first === undefined || first.arc_id === null || first.arc_state === undefined) {
    throw new Error('Invalid first Arc lifecycle trace event')
  }

  const states = lifecycle.map((event) => {
    if (event.arc_id !== first.arc_id) {
      throw new Error('Trace contains multiple Arc ids')
    }
    if (event.origin_hash !== first.origin_hash) {
      throw new Error('Trace contains multiple origin hashes')
    }
    if (event.arc_state === undefined) {
      throw new Error('Trace event missing Arc state')
    }
    return event.arc_state
  })

  const terminalState = states[states.length - 1]
  if (terminalState === undefined) {
    throw new Error('Trace did not produce a terminal state')
  }

  return {
    arc_id: first.arc_id,
    origin_hash: first.origin_hash,
    states,
    terminal_state: terminalState,
  }
}
