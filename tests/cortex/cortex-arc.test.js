import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { createCortex, createOrientationLoop } from '../../dist/cortex/index.js'
import { deriveArcState } from '../../dist/schemas/arc.js'

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
  assert.equal(signal.arc.resolved_at !== undefined, true)
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
    assert.equal(signal.focusCycle.ruleset, 'alpha-mvc-focus-cycle/v1')
  assert.equal(signal.focusCycle.decision, signal.focusDecision)
  assert.deepEqual(signal.focusCycle.candidates.map((candidate) => candidate.state), ['ENGAGED'])
  assert.deepEqual(signal.focusDecision, {
    arcId: 'arc-1',
    selectedTitle: 'Define the smallest useful CARL loop.',
    selectedState: 'ENGAGED',
    facultyId: 'faculty/llm/direct',
    facultyRole: 'MODEL_FACULTY',
    reason: 'Selected highest salience candidate using alpha-mvc-focus-cycle/v1.',
    salience: {
      total: 130,
      value: 130,
      terms: [
        {
          name: 'ACTIVATION_EVIDENCE',
          value: 100,
          reason: 'ARC_ACTIVE trace evidence marks this Arc as activated for immediate Cortex processing.',
        },
        {
          name: 'OPERATOR_RECENCY',
          value: 30,
          reason: 'Operator recency contributes +30.',
        },
      ],
      reasons: [
        'ARC_ACTIVE trace evidence marks this Arc as activated for immediate Cortex processing.',
        'Operator recency contributes +30.',
      ],
    },
  })
})

test('Arc presentation state is derived from current OrientationTick engagement and terminal facts', () => {
  const baseArc = {
    id: 'arc-derived',
    title: 'derive state',
        target: 'derive state',
    created_at: 100,
    budget: {
      max_model_calls: 0,
      max_faculty_dispatches: 0,
      max_wall_time_ms: 0,
    },
    resource_needs: [],
    tasks: [],
    trace_refs: [],
    relations: [],
  }

  assert.equal(deriveArcState(baseArc), 'INCUBATING')
  assert.equal(deriveArcState(baseArc, { currentTick: { engaged_arc_id: 'other-arc' } }), 'INCUBATING')
  assert.equal(deriveArcState(baseArc, { currentTick: { engaged_arc_id: 'arc-derived' } }), 'ENGAGED')
  assert.equal(deriveArcState({ ...baseArc, activated_at: 100 }), 'INHIBITED')
      assert.equal(deriveArcState({ ...baseArc, resolved_at: 200 }, { currentTick: { engaged_arc_id: 'arc-derived' } }), 'RESOLVED')
    assert.equal(deriveArcState({ ...baseArc, absorbed_into_arc_id: 'arc-parent' }, { currentTick: { engaged_arc_id: 'arc-derived' } }), 'ABSORBED')
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
  assert.equal(candidate?.salience.total, 100)
})

test('OrientationLoop creates an explainable FocusCycle from multiple unresolved Arcs', () => {
  let id = 0
  let clock = 999
  const cortex = createCortex({
    createArcId: () => `arc-${++id}`,
    now: () => ++clock,
    defaultFacultyId: 'persona-direct',
  })
  const ordinary = cortex.arcStore.openArc({
    target: 'Document regular inbox cleanup.',
    origin: operatorOrigin,
  }).arc
  const urgentSecurity = cortex.arcStore.openArc({
    target: 'Urgent security token leak investigation now.',
    origin: operatorOrigin,
  }).arc
  const background = cortex.arcStore.openArc({
    target: 'Background docs cleanup.',
    origin: operatorOrigin,
  }).arc

  const focusCycle = cortex.orientationLoop.createFocusCycle([
    ordinary,
    urgentSecurity,
    background,
  ], {
    cycleId: 'focus-cycle-test',
    createdAt: 2000,
  })

  assert.equal(focusCycle.cycleId, 'focus-cycle-test')
  assert.equal(focusCycle.createdAt, 2000)
  assert.equal(focusCycle.ruleset, 'alpha-mvc-focus-cycle/v1')
  assert.equal(focusCycle.decision.arcId, urgentSecurity.id)
  assert.equal(focusCycle.decision.selectedTitle, urgentSecurity.title)
  assert.equal(focusCycle.decision.facultyId, 'persona-direct')
  assert.equal(focusCycle.decision.facultyRole, 'MODEL_FACULTY')
  assert.match(focusCycle.decision.reason, /highest salience/i)
  assert.deepEqual(
    focusCycle.decision.salience.terms.map((term) => term.name),
    ['OPENING_EVIDENCE', 'OPERATOR_RECENCY', 'URGENCY_MARKER', 'SECURITY_MARKER'],
  )
  assert.deepEqual(focusCycle.candidates.map((candidate) => candidate.arcId), [urgentSecurity.id, background.id, ordinary.id])
  assert.deepEqual(focusCycle.candidates.map((candidate) => candidate.state), ['ENGAGED', 'INCUBATING', 'INCUBATING'])
  assert.deepEqual(focusCycle.candidates.map((candidate) => candidate.presentationState), ['ENGAGED', 'INCUBATING', 'INCUBATING'])
  })

test('OrientationLoop tie behavior chooses newest created_at then lexicographic Arc id', () => {
  const orientationLoop = createOrientationLoop({
    scoreArc: () => ({
      total: 80,
      value: 80,
      terms: [{ name: 'OPENING_EVIDENCE', value: 80, reason: 'Fixed tie-test salience.' }],
      reasons: ['Fixed tie-test salience.'],
    }),
  })
  const baseArc = {
    id: 'arc-base',
    title: 'same score',
        target: 'same score',
    created_at: 100,
    budget: {
      max_model_calls: 0,
      max_faculty_dispatches: 0,
      max_wall_time_ms: 0,
    },
    resource_needs: [],
    tasks: [],
    trace_refs: [],
    relations: [],
  }

  const newestWins = orientationLoop.createFocusCycle([
    { ...baseArc, id: 'arc-old', created_at: 100 },
    { ...baseArc, id: 'arc-new', created_at: 200 },
  ], {
    cycleId: 'newest-wins',
    createdAt: 300,
  })
  assert.equal(newestWins.decision.arcId, 'arc-new')
  assert.match(newestWins.decision.reason, /newest created_at/i)

  const lexicographicWins = orientationLoop.createFocusCycle([
    { ...baseArc, id: 'arc-b', created_at: 100 },
    { ...baseArc, id: 'arc-a', created_at: 100 },
  ], {
    cycleId: 'lexicographic-wins',
    createdAt: 300,
  })
  assert.equal(lexicographicWins.decision.arcId, 'arc-a')
  assert.match(lexicographicWins.decision.reason, /lexicographic Arc id/i)
})

test('Persona module does not own FocusCycle salience scoring terms', () => {
  const personaSource = readFileSync(new URL('../../cortex/persona.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(personaSource, /FocusCycle/)
  assert.doesNotMatch(personaSource, /FocusCandidate/)
  assert.doesNotMatch(personaSource, /OPENING_EVIDENCE/)
  assert.doesNotMatch(personaSource, /URGENCY_MARKER/)
  assert.doesNotMatch(personaSource, /SECURITY_MARKER/)
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
