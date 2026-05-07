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

test('Cortex opens an Arc from a validated incoming signal and Persona resolves it directly', async () => {
  const cortex = createCortex({
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
  assert.equal(signal.arc.target, 'Define the smallest useful CARL loop.')
  assert.equal(signal.arc.tasks.length, 0)
  assert.equal(signal.arc.resolution, 'Direct Persona resolution: Define the smallest useful CARL loop.')
  assert.equal(signal.response, signal.arc.resolution)
  assert.deepEqual(signal.trace.map((event) => event.event_type), ['ARC_OPEN', 'ARC_ACTIVE', 'ARC_RESOLVED'])
  assert.deepEqual(signal.trace.map((event) => event.arc_state), ['OPEN', 'ACTIVE', 'RESOLVED'])
})

test('Cortex preserves Arc context for status/reboot-style inspection', async () => {
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
      state: 'RESOLVED',
      target: 'Report current Arc status.',
      summary: 'Report current Arc status.',
    },
  ])

  assert.deepEqual(cortex.getArc('arc-status'), {
    id: 'arc-status',
    state: 'RESOLVED',
    target: 'Report current Arc status.',
    budget: {
      max_model_calls: 0,
      max_faculty_dispatches: 0,
      max_wall_time_ms: 0,
    },
    resource_needs: [],
    tasks: [],
    trace_refs: ['ARC_OPEN', 'ARC_ACTIVE', 'ARC_RESOLVED'],
    resolution: 'Resolved: Report current Arc status.',
  })
})
