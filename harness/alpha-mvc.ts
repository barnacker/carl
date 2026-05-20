import { createCortex, type Cortex, type PersonaResponseSignal } from '../cortex/index.js'
import type { CreateResponseInput } from '../cortex/persona.js'
import { assertPrimePresence } from '../nervous-system/immune-system/index.js'
import { assertOriginStamp, type OriginStamp } from '../schemas/origin-stamp.js'

export const alphaMvcHarnessBoundary = 'alpha-mvc/fake-nervous-system-world' as const

export type AlphaMvcHarnessTraceType =
  | 'FAKE_DISCORD_CHAT_RECEIVED'
  | 'FAKE_DISCORD_FACULTY_PUBLISH'
  | 'FAKE_NERVOUS_SYSTEM_RELAY_TO_CORTEX'
  | 'FAKE_MODEL_FACULTY_INVOKED'
  | 'FAKE_MODEL_FACULTY_RESULT'
  | 'FAKE_IRREVERSIBLE_GUARD_PROPOSAL'
  | 'CORTEX_ARC_RESOLVED'
  | 'FAKE_DISCORD_RESPONSE_EMITTED'

export interface AlphaMvcHarnessTraceEvent {
  readonly event_type: AlphaMvcHarnessTraceType
  readonly boundary: string
  readonly detail: string
  readonly arc_id?: string
}

export interface FakeDiscordChatEvent {
  readonly platform: 'discord'
  readonly channel_id: string
  readonly user_id: string
  readonly message: string
}

export interface FakeDiscordOutput {
  readonly platform: 'discord'
  readonly channel_id: string
  readonly content: string
}

export interface ModelFacultyInvocation {
  readonly faculty_id: 'faculty/model/current-hermes'
  readonly prompt: string
  readonly arc_id: string
  readonly origin: OriginStamp
}

export interface ModelFacultyResult {
  readonly content: string
}

export interface AlphaMvcHarnessResult {
  readonly input: FakeDiscordChatEvent
  readonly output: FakeDiscordOutput
  readonly cortex: PersonaResponseSignal
  readonly trace: readonly AlphaMvcHarnessTraceEvent[]
}

export interface AlphaMvcHarnessDependencies {
  readonly cortex?: Cortex
  readonly createArcId?: () => string
  readonly now?: () => number
  readonly invokeModelFaculty: (invocation: ModelFacultyInvocation) => Promise<ModelFacultyResult>
  readonly previousArcId?: string
  readonly primePath?: string
  readonly primeExists?: (path: string) => boolean
}

const DEFAULT_PRIME_PATH = 'workspace-template/PRIME.md'

function createFakeDiscordOrigin(event: FakeDiscordChatEvent, now: number): OriginStamp {
  return {
    origin_id: `${event.platform}:${event.channel_id}:${event.user_id}`,
    origin_type: 'OPERATOR',
    authenticated: true,
    authority: 'OPERATOR',
    issued_at: now,
    nonce: `${event.channel_id}:${event.user_id}:${now}`,
    signature_hash: `fake-discord:${event.channel_id}:${event.user_id}`,
  }
}

export function isDeclaredIrreversibleIntent(message: string): boolean {
  return /\b(delete|destroy|transfer|purchase|buy|send|email|deploy|restart|shutdown|wire|commit|push|merge|rm\s+-rf)\b/i.test(message)
}

export function createAlphaMvcHarness(dependencies: AlphaMvcHarnessDependencies) {
  const now = dependencies.now ?? (() => Date.now())
  let generatedArcCount = 0

  function createRunCortex(trace: AlphaMvcHarnessTraceEvent[]): Cortex {
    if (dependencies.cortex !== undefined) {
      return dependencies.cortex
    }

    const cortexDependencies = {
      now,
      ...(dependencies.previousArcId !== undefined ? { previousArcId: dependencies.previousArcId } : {}),
      createResponse: async (input: CreateResponseInput): Promise<string> => {
        if (isDeclaredIrreversibleIntent(input.signal.text)) {
          trace.push({
            event_type: 'FAKE_IRREVERSIBLE_GUARD_PROPOSAL',
            boundary: 'fake-immune-system-floor',
            detail: 'Irreversible intent represented as proposal only; no execution API exposed.',
            arc_id: input.arc.id,
          })
          return `Proposal only; no irreversible action executed: ${input.signal.text}`
        }

        trace.push({
          event_type: 'FAKE_MODEL_FACULTY_INVOKED',
          boundary: 'fake-model-faculty',
          detail: 'Harness invokes real model faculty while imitating Nervous System routing.',
          arc_id: input.arc.id,
        })
        const result = await dependencies.invokeModelFaculty({
          faculty_id: 'faculty/model/current-hermes',
          prompt: input.signal.text,
          arc_id: input.arc.id,
          origin: input.signal.origin,
        })
        trace.push({
          event_type: 'FAKE_MODEL_FACULTY_RESULT',
          boundary: 'fake-model-faculty',
          detail: 'Harness returned model result to Cortex as a faculty-like result.',
          arc_id: input.arc.id,
        })
        return result.content
      },
    }

    const createArcId = dependencies.createArcId ?? (() => `arc-${++generatedArcCount}`)

    return createCortex({
      ...cortexDependencies,
      createArcId,
    })
  }

  return {
    async runDiscordMessage(message: string): Promise<AlphaMvcHarnessResult> {
      const trace: AlphaMvcHarnessTraceEvent[] = []
      const cortex = createRunCortex(trace)
      const primePath = dependencies.primePath ?? DEFAULT_PRIME_PATH
      assertPrimePresence({
        path: primePath,
        exists: dependencies.primeExists ?? (() => true),
      })

      const input: FakeDiscordChatEvent = {
        platform: 'discord',
        channel_id: 'cli-harness',
        user_id: 'operator',
        message,
      }
      trace.push({
        event_type: 'FAKE_DISCORD_CHAT_RECEIVED',
        boundary: 'carltest --discord',
        detail: 'Command line created fake Discord chat event.',
      })
      trace.push({
        event_type: 'FAKE_DISCORD_FACULTY_PUBLISH',
        boundary: 'fake-discord-faculty',
        detail: 'Fake Discord Faculty published chat event toward fake Nervous System relay.',
      })

      const origin = assertOriginStamp(createFakeDiscordOrigin(input, now()))
      trace.push({
        event_type: 'FAKE_NERVOUS_SYSTEM_RELAY_TO_CORTEX',
        boundary: 'fake-nervous-system-relay',
        detail: 'Harness relayed typed fake Discord signal into real Cortex.',
      })
      const cortexResponse = await cortex.receiveSignal({
        signal_type: 'INCOMING_MESSAGE',
        origin,
        text: input.message,
      })
      trace.push({
        event_type: 'CORTEX_ARC_RESOLVED',
        boundary: 'cortex',
        detail: 'Real Cortex resolved Arc inside fake surrounding world.',
        arc_id: cortexResponse.arc.id,
      })

      const output: FakeDiscordOutput = {
        platform: 'discord',
        channel_id: input.channel_id,
        content: cortexResponse.response,
      }
      trace.push({
        event_type: 'FAKE_DISCORD_RESPONSE_EMITTED',
        boundary: 'fake-discord-output',
        detail: 'Harness emitted fake Discord-style response.',
        arc_id: cortexResponse.arc.id,
      })

      return {
        input,
        output,
        cortex: cortexResponse,
        trace: [...trace],
      }
    },
  }
}
