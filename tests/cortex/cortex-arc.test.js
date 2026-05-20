import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { createCortex } from '../../dist/cortex/index.js'

const operatorOrigin = {
  origin_id: 'operator-1',
  origin_type: 'OPERATOR',
  authenticated: true,
  authority: 'OPERATOR',
  issued_at: 1,
  nonce: 'nonce-1',
  signature_hash: 'origin-hash-1',
}

test('Cortex contains Persona, ArcStore, and OrientationLoop components', () => {
  const cortex = createCortex({
    persona: {
      llmFacultyId: 'faculty/llm/direct',
      primeDirective: 'Resolve validated operator signals.',
      personaPromptMemoryRef: 'memory/persona/carl',
    },
  })

  assert.equal(cortex.persona.llmFacultyId, 'faculty/llm/direct')
  assert.equal(cortex.persona.primeDirective, 'Resolve validated operator signals.')
  assert.equal(cortex.persona.personaPromptMemoryRef, 'memory/persona/carl')
  assert.equal(typeof cortex.arcStore.openArc, 'function')
  assert.equal(typeof cortex.arcStore.listArcIndex, 'function')
  assert.equal(typeof cortex.orientationLoop.scoreArc, 'function')
  assert.equal(typeof cortex.orientationLoop.decideFocus, 'function')
})

test('Cortex Stage 0 components use flat module files until submodules are justified', () => {
  const moduleRoot = new URL('../../cortex/', import.meta.url)

  for (const filename of [
    'persona.ts',
    'arc-store.ts',
    'orientation-loop.ts',
    'reasoning-engine.ts',
    'decomposer.ts',
    'result-buffer.ts',
    'synthesis-gate.ts',
  ]) {
    assert.equal(existsSync(new URL(filename, moduleRoot)), true, `${filename} should exist as a flat component module`)
  }

  for (const directory of [
    'persona/',
    'arc-store/',
    'orientation-loop/',
    'reasoning-engine/',
    'decomposer/',
    'result-buffer/',
    'synthesis-gate/',
  ]) {
    assert.equal(existsSync(new URL(directory, moduleRoot)), false, `${directory} should not exist before internal submodules are justified`)
  }
})

test('Persona module does not own Cortex, ArcStore, or OrientationLoop API exports', () => {
  const personaSource = readFileSync(new URL('../../cortex/persona.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(personaSource, /export interface Cortex\b/)
  assert.doesNotMatch(personaSource, /export function createCortex\b/)
  assert.doesNotMatch(personaSource, /createArcId/)
  assert.doesNotMatch(personaSource, /new Map/)
  assert.doesNotMatch(personaSource, /receiveSignal\(/)
  assert.doesNotMatch(personaSource, /listArcIndex\(/)
  assert.doesNotMatch(personaSource, /getArc\(/)
  assert.doesNotMatch(personaSource, /FocusDecision/)
  assert.doesNotMatch(personaSource, /SalienceScore/)
})

test('Cortex opens an Arc in ArcStore and runs a direct Persona FocusCycle', async () => {
  const cortex = createCortex({
    persona: {
      llmFacultyId: 'faculty/llm/direct',
      primeDirective: 'Resolve validated operator signals.',
      personaPromptMemoryRef: 'memory/persona/carl',
    },
    createArcId: () => 'arc-1',
    now: () => 100,
    createResponse: ({ target }) => `Direct Persona resolution: ${target}`,
  })

  const signal = await cortex.receiveSignal({
    signal_type: 'INCOMING_MESSAGE',
    origin: operatorOrigin,
    text: 'Define the smallest useful CARL loop.',
  })

  assert.equal(signal.signal_type, 'PERSONA_RESPONSE')
  assert.equal(signal.arc.id, 'arc-1')
  assert.equal(signal.arc.state, 'RESOLVED')
  assert.equal(signal.arc.title, 'Define the smallest useful CARL loop.')
  assert.equal(signal.arc.target, 'Define the smallest useful CARL loop.')
  assert.equal(signal.arc.created_at, 100)
  assert.equal(signal.arc.activated_at, 100)
  assert.equal(signal.arc.resolved_at, 100)
  assert.deepEqual(signal.arc.relations, [])
  assert.equal(signal.arc.tasks.length, 0)
  assert.equal(signal.arc.resolution, 'Direct Persona resolution: Define the smallest useful CARL loop.')
  assert.equal(signal.response, signal.arc.resolution)
  assert.deepEqual(signal.trace.map((event) => event.event_type), ['ARC_OPEN', 'ARC_ACTIVE', 'ARC_RESOLVED'])
  assert.deepEqual(signal.trace.map((event) => event.arc_state), ['OPEN', 'ACTIVE', 'RESOLVED'])
  assert.deepEqual(signal.focusDecision, {
    arcId: 'arc-1',
    facultyId: 'faculty/llm/direct',
    facultyRole: 'PERSONA',
    reason: 'Stage 0 direct FocusCycle routes the selected Arc to Persona.',
    salience: {
      value: 11,
      reasons: [
        'arc state ACTIVE is eligible for focus',
        '0 unresolved task(s)',
        '1 resource need(s)',
      ],
    },
  })
})

test('OrientationLoop selects the highest-salience open Arc candidate', () => {
  const cortex = createCortex()
  const low = cortex.arcStore.openArc({
    target: 'Low salience item.',
    origin: operatorOrigin,
  }).arc
  const high = cortex.arcStore.openArc({
    target: 'High salience item.',
    origin: operatorOrigin,
    resourceNeeds: ['faculty/llm/high-reasoning'],
  }).arc
  const activeHigh = cortex.arcStore.activateArc({
    arcId: high.id,
    origin: operatorOrigin,
  }).arc

  const candidate = cortex.orientationLoop.selectFocusCandidate([low, activeHigh])
  assert.equal(candidate?.arc.id, activeHigh.id)
  assert.equal(candidate?.salience.value, 11)
})

test('Cortex owns Arc inspection through ArcStore', async () => {
  const cortex = createCortex({
    createArcId: () => 'arc-status',
    now: () => 200,
    createResponse: ({ target }) => `Resolved: ${target}`,
  })

  await cortex.receiveSignal({
    signal_type: 'INCOMING_MESSAGE',
    origin: operatorOrigin,
    text: 'Report current Arc status.',
  })

  assert.deepEqual(cortex.listArcIndex(), [
    {
      id: 'arc-status',
      title: 'Report current Arc status.',
      state: 'RESOLVED',
      target: 'Report current Arc status.',
      summary: 'Resolved: Report current Arc status.',
      created_at: 200,
      resolved_at: 200,
    },
  ])

  assert.equal(cortex.persona.getArc, undefined)
  assert.equal(cortex.persona.listArcIndex, undefined)
  assert.deepEqual(cortex.getArc('arc-status'), {
    id: 'arc-status',
    title: 'Report current Arc status.',
    state: 'RESOLVED',
    target: 'Report current Arc status.',
    summary: 'Resolved: Report current Arc status.',
    created_at: 200,
    activated_at: 200,
    resolved_at: 200,
    budget: {
      max_model_calls: 0,
      max_faculty_dispatches: 0,
      max_wall_time_ms: 0,
    },
    resource_needs: ['faculty/llm/direct'],
    tasks: [],
    trace_refs: ['ARC_OPEN', 'ARC_ACTIVE', 'ARC_RESOLVED'],
    relations: [],
    resolution: 'Resolved: Report current Arc status.',
  })
})
