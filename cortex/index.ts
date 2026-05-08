import type { ArcRecord } from '../schemas/arc.js'
import {
  createPersona,
  type ArcIndexEntry,
  type IncomingMessageSignal,
  type Persona,
  type PersonaConfiguration,
  type PersonaDependencies,
  type PersonaResponseSignal,
} from './persona/index.js'

export const cortexBoundary = 'cortex' as const

export interface CortexDependencies extends PersonaDependencies {
  readonly persona?: Partial<PersonaConfiguration>
}

export interface Cortex {
  readonly persona: Persona
  receiveSignal(signal: IncomingMessageSignal): Promise<PersonaResponseSignal>
  listArcIndex(): readonly ArcIndexEntry[]
  getArc(arcId: string): ArcRecord | undefined
}

export function createCortex(dependencies: CortexDependencies = {}): Cortex {
  const persona = createPersona(dependencies)

  return {
    persona,

    receiveSignal(signal: IncomingMessageSignal): Promise<PersonaResponseSignal> {
      return persona.receiveSignal(signal)
    },

    listArcIndex(): readonly ArcIndexEntry[] {
      return persona.listArcIndex()
    },

    getArc(arcId: string): ArcRecord | undefined {
      return persona.getArc(arcId)
    },
  }
}

export { createPersona, personaBoundary } from './persona/index.js'

export type {
  ArcIndexEntry,
  CreateResponseInput,
  IncomingMessageSignal,
  Persona,
  PersonaConfiguration,
  PersonaDependencies,
  PersonaResponseSignal,
} from './persona/index.js'
