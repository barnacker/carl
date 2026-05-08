import type { ArcRecord } from '../../schemas/arc.js'
import type { OriginStamp } from '../../schemas/origin-stamp.js'

export const personaBoundary = 'persona' as const

export interface IncomingMessageSignal {
  readonly signal_type: 'INCOMING_MESSAGE'
  readonly origin: OriginStamp
  readonly text: string
}

export interface CreateResponseInput {
  readonly target: string
  readonly arc: ArcRecord
  readonly signal: IncomingMessageSignal
  readonly persona: Persona
}

export interface PersonaConfiguration {
  readonly llmFacultyId: string
  readonly primeDirective: string
  readonly personaPromptMemoryRef: string
}

export interface PersonaDependencies {
  readonly persona?: Partial<PersonaConfiguration>
  readonly createResponse?: (input: CreateResponseInput) => string
}

export interface Persona extends PersonaConfiguration {
  createResponse(input: Omit<CreateResponseInput, 'persona'>): string
}

const DEFAULT_PERSONA_CONFIGURATION: PersonaConfiguration = {
  llmFacultyId: 'faculty/llm/direct',
  primeDirective: 'Resolve validated signals into Arc outcomes.',
  personaPromptMemoryRef: 'memory/persona/carl',
}

export function createPersona(dependencies: PersonaDependencies = {}): Persona {
  const personaConfiguration: PersonaConfiguration = {
    ...DEFAULT_PERSONA_CONFIGURATION,
    ...dependencies.persona,
  }

  const persona: Persona = {
    ...personaConfiguration,

    createResponse(input: Omit<CreateResponseInput, 'persona'>): string {
      const createResponse = dependencies.createResponse ?? (({ target }: CreateResponseInput) => target)

      return createResponse({
        ...input,
        persona,
      })
    },
  }

  return persona
}
