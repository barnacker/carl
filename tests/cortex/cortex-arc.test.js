import assert from 'node:assert/strict'
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

test('Cortex contains Persona with identity and model-routing properties', () => {
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
})

test('Persona opens an Arc from a validated incoming signal and resolves it directly', async () => {
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

  const signal = await cortex.persona.receiveSignal({
    signal_type: 'INCOMING_MESSAGE',
    origin: operatorOrigin,
    text: 'Define the smallest useful CARL loop.',
  })

  assert.equal(signal.signal_type, 'PERSONA_RESPONSE')
  assert.equal(signal.arc.id, 'arc-1')
  assert.equal(signal.arc.state, 'RESOLVED')
  assert.equal(signal.arc.target, 'Define the smallest useful CARL loop.')
  assert.equal(signal.arc.tasks.length, 0)
  assert.equal(signal.arc.resolution, 'Direct Persona resolution: Define the smallest useful CARL loop.')
  assert.equal(signal.response, signal.arc.resolution)
  assert.deepEqual(signal.trace.map((event) => event.event_type), ['ARC_OPEN', 'ARC_ACTIVE', 'ARC_RESOLVED'])
  assert.deepEqual(signal.trace.map((event) => event.arc_state), ['OPEN', 'ACTIVE', 'RESOLVED'])
})

test('Cortex delegates incoming signals to Persona', async () => {
  const cortex = createCortex({
    createArcId: () => 'arc-delegated',
    now: () => 150,
    createResponse: ({ target }) => `Delegated: ${target}`,
  })

  const signal = await cortex.receiveSignal({
    signal_type: 'INCOMING_MESSAGE',
    origin: operatorOrigin,
    text: 'Route this through Cortex.',
  })

  assert.equal(signal.arc.id, 'arc-delegated')
  assert.equal(cortex.persona.getArc('arc-delegated')?.resolution, 'Delegated: Route this through Cortex.')
})

test('Persona preserves Arc context for status/reboot-style inspection', async () => {
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

  assert.deepEqual(cortex.persona.listArcIndex(), [
    {
      id: 'arc-status',
      state: 'RESOLVED',
      target: 'Report current Arc status.',
      summary: 'Report current Arc status.',
    },
  ])

  assert.deepEqual(cortex.persona.getArc('arc-status'), {
    id: 'arc-status',
    state: 'RESOLVED',
    target: 'Report current Arc status.',
    budget: {
      max_model_calls: 0,
      max_faculty_dispatches: 0,
      max_wall_time_ms: 0,
    },
    resource_needs: ['faculty/llm/direct'],
    tasks: [],
    trace_refs: ['ARC_OPEN', 'ARC_ACTIVE', 'ARC_RESOLVED'],
    resolution: 'Resolved: Report current Arc status.',
  })
})
