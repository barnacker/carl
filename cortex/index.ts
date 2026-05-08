import type { ArcRecord } from '../schemas/arc.js'
import type { TraceEvent } from '../schemas/trace-event.js'
import {
  createArcStore,
  type ArcIndexEntry,
  type ArcStore,
  type ArcStoreDependencies,
} from './arc-store/index.js'
import {
  createOrientationLoop,
  type FocusDecision,
  type OrientationLoop,
  type OrientationLoopDependencies,
} from './orientation-loop/index.js'
import {
  createPersona,
  type IncomingMessageSignal,
  type Persona,
  type PersonaConfiguration,
  type PersonaDependencies,
} from './persona/index.js'

export const cortexBoundary = 'cortex' as const

export interface PersonaResponseSignal {
  readonly signal_type: 'PERSONA_RESPONSE'
  readonly arc: ArcRecord
  readonly focusDecision: FocusDecision
  readonly response: string
  readonly trace: readonly TraceEvent[]
}

export interface CortexDependencies extends PersonaDependencies, ArcStoreDependencies, OrientationLoopDependencies {
  readonly persona?: Partial<PersonaConfiguration>
  readonly arcStore?: ArcStore
  readonly orientationLoop?: OrientationLoop
}

export interface Cortex {
  readonly persona: Persona
  readonly arcStore: ArcStore
  readonly orientationLoop: OrientationLoop
  receiveSignal(signal: IncomingMessageSignal): Promise<PersonaResponseSignal>
  listArcIndex(): readonly ArcIndexEntry[]
  getArc(arcId: string): ArcRecord | undefined
}

export function createCortex(dependencies: CortexDependencies = {}): Cortex {
  const persona = createPersona(dependencies)
  const arcStore = dependencies.arcStore ?? createArcStore(dependencies)
  const orientationLoop = dependencies.orientationLoop ?? createOrientationLoop({
    ...dependencies,
    defaultFacultyId: dependencies.defaultFacultyId ?? persona.llmFacultyId,
  })

  return {
    persona,
    arcStore,
    orientationLoop,

    async receiveSignal(signal: IncomingMessageSignal): Promise<PersonaResponseSignal> {
      const opened = arcStore.openArc({
        target: signal.text,
        origin: signal.origin,
        resourceNeeds: [persona.llmFacultyId],
      })
      const active = arcStore.activateArc({
        arcId: opened.arc.id,
        origin: signal.origin,
      })
      const focusDecision = orientationLoop.decideFocus({
        arc: active.arc,
        salience: orientationLoop.scoreArc(active.arc),
      })
      const response = persona.createResponse({
        target: active.arc.target,
        arc: active.arc,
        signal,
      })
      const resolved = arcStore.resolveArc({
        arcId: focusDecision.arcId,
        origin: signal.origin,
        resolution: response,
      })

      return {
        signal_type: 'PERSONA_RESPONSE',
        arc: resolved.arc,
        focusDecision,
        response,
        trace: [opened.trace, active.trace, resolved.trace],
      }
    },

    listArcIndex(): readonly ArcIndexEntry[] {
      return arcStore.listArcIndex()
    },

    getArc(arcId: string): ArcRecord | undefined {
      return arcStore.getArc(arcId)
    },
  }
}

export { arcStoreBoundary, createArcStore } from './arc-store/index.js'
export { createOrientationLoop, orientationLoopBoundary } from './orientation-loop/index.js'
export { createPersona, personaBoundary } from './persona/index.js'

export type {
  ArcIndexEntry,
  ArcStore,
  ArcStoreDependencies,
  ArcStoreMutation,
  OpenArcInput,
  ResolveArcInput,
  TransitionArcInput,
} from './arc-store/index.js'

export type {
  FacultyRole,
  FocusCandidate,
  FocusDecision,
  OrientationLoop,
  OrientationLoopDependencies,
  SalienceScore,
} from './orientation-loop/index.js'

export type {
  CreateResponseInput,
  IncomingMessageSignal,
  Persona,
  PersonaConfiguration,
  PersonaDependencies,
} from './persona/index.js'
