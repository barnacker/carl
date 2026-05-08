import type { ArcRecord } from '../schemas/arc.js'
import type { TraceEvent } from '../schemas/trace-event.js'
import {
  createArcStore,
  type ArcIndexEntry,
  type ArcStore,
  type ArcStoreDependencies,
} from './arc-store/index.js'
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
  readonly response: string
  readonly trace: readonly TraceEvent[]
}

export interface CortexDependencies extends PersonaDependencies, ArcStoreDependencies {
  readonly persona?: Partial<PersonaConfiguration>
  readonly arcStore?: ArcStore
}

export interface Cortex {
  readonly persona: Persona
  readonly arcStore: ArcStore
  receiveSignal(signal: IncomingMessageSignal): Promise<PersonaResponseSignal>
  listArcIndex(): readonly ArcIndexEntry[]
  getArc(arcId: string): ArcRecord | undefined
}

export function createCortex(dependencies: CortexDependencies = {}): Cortex {
  const persona = createPersona(dependencies)
  const arcStore = dependencies.arcStore ?? createArcStore(dependencies)

  return {
    persona,
    arcStore,

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
      const response = persona.createResponse({
        target: active.arc.target,
        arc: active.arc,
        signal,
      })
      const resolved = arcStore.resolveArc({
        arcId: active.arc.id,
        origin: signal.origin,
        resolution: response,
      })

      return {
        signal_type: 'PERSONA_RESPONSE',
        arc: resolved.arc,
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
  CreateResponseInput,
  IncomingMessageSignal,
  Persona,
  PersonaConfiguration,
  PersonaDependencies,
} from './persona/index.js'
