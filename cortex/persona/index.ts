import type { ArcRecord, ArcState } from '../../schemas/arc.js'
import type { OriginStamp } from '../../schemas/origin-stamp.js'
import type { TraceEvent, TraceEventType } from '../../schemas/trace-event.js'

export const personaBoundary = 'persona' as const

export interface IncomingMessageSignal {
  readonly signal_type: 'INCOMING_MESSAGE'
  readonly origin: OriginStamp
  readonly text: string
}

export interface PersonaResponseSignal {
  readonly signal_type: 'PERSONA_RESPONSE'
  readonly arc: ArcRecord
  readonly response: string
  readonly trace: readonly TraceEvent[]
}

export interface ArcIndexEntry {
  readonly id: string
  readonly state: ArcState
  readonly target: string
  readonly summary: string
}

export interface CreateResponseInput {
  readonly target: string
  readonly arc: ArcRecord
  readonly signal: IncomingMessageSignal
}

export interface CortexDependencies {
  readonly createArcId?: () => string
  readonly now?: () => number
  readonly createResponse?: (input: CreateResponseInput) => string
}

export interface Cortex {
  receiveSignal(signal: IncomingMessageSignal): Promise<PersonaResponseSignal>
  listArcIndex(): readonly ArcIndexEntry[]
  getArc(arcId: string): ArcRecord | undefined
}

const DIRECT_ARC_SCHEMA_HASH = 'cortex-arc/v1'
const DIRECT_PERSONA_FACULTY_ID = 'cortex/persona'

export function createCortex(dependencies: CortexDependencies = {}): Cortex {
  const arcStore = new Map<string, ArcRecord>()
  const createArcId = dependencies.createArcId ?? (() => `arc-${arcStore.size + 1}`)
  const now = dependencies.now ?? (() => Date.now())
  const createResponse = dependencies.createResponse ?? (({ target }: CreateResponseInput) => target)

  return {
    async receiveSignal(signal: IncomingMessageSignal): Promise<PersonaResponseSignal> {
      const arcId = createArcId()
      let arc: ArcRecord = {
        id: arcId,
        state: 'OPEN',
        target: signal.text,
        budget: {
          max_model_calls: 0,
          max_faculty_dispatches: 0,
          max_wall_time_ms: 0,
        },
        resource_needs: [],
        tasks: [],
        trace_refs: [],
      }
      const trace: TraceEvent[] = []

      const transition = (event_type: Extract<TraceEventType, 'ARC_OPEN' | 'ARC_ACTIVE' | 'ARC_RESOLVED'>, arc_state: Extract<ArcState, 'OPEN' | 'ACTIVE' | 'RESOLVED'>): void => {
        const traceEvent: TraceEvent = {
          ts: now(),
          faculty_id: DIRECT_PERSONA_FACULTY_ID,
          event_type,
          schema_hash: DIRECT_ARC_SCHEMA_HASH,
          arc_id: arc.id,
          origin_hash: signal.origin.signature_hash,
          arc_state,
        }

        trace.push(traceEvent)
        arc = {
          ...arc,
          state: arc_state,
          trace_refs: [...arc.trace_refs, event_type],
        }
        arcStore.set(arc.id, arc)
      }

      transition('ARC_OPEN', 'OPEN')
      transition('ARC_ACTIVE', 'ACTIVE')

      const response = createResponse({ target: arc.target, arc, signal })
      arc = {
        ...arc,
        resolution: response,
      }

      transition('ARC_RESOLVED', 'RESOLVED')

      return {
        signal_type: 'PERSONA_RESPONSE',
        arc,
        response,
        trace,
      }
    },

    listArcIndex(): readonly ArcIndexEntry[] {
      return Array.from(arcStore.values()).map((arc) => ({
        id: arc.id,
        state: arc.state,
        target: arc.target,
        summary: arc.target,
      }))
    },

    getArc(arcId: string): ArcRecord | undefined {
      return arcStore.get(arcId)
    },
  }
}
