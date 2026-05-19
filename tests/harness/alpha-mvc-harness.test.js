import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

import { createAlphaMvcHarness, isDeclaredIrreversibleIntent } from '../../dist/harness/alpha-mvc.js'
import { replayArcLifecycle } from '../../dist/nervous-system/trace/index.js'
import { isOriginStamp } from '../../dist/schemas/origin-stamp.js'

function traceTypes(result) {
  return result.trace.map((event) => event.event_type)
}

test('Alpha MVC harness drives fake Discord chat through fake Nervous System world into real Cortex', async () => {
  const invocations = []
  const harness = createAlphaMvcHarness({
    createArcId: () => 'arc-alpha-1',
    now: () => 123,
    primeExists: () => true,
    invokeModelFaculty: async (invocation) => {
      invocations.push(invocation)
      assert.equal(invocation.faculty_id, 'faculty/model/current-hermes')
      assert.equal(invocation.prompt, 'Hey how are you?')
      assert.equal(invocation.arc_id, 'arc-alpha-1')
      assert.equal(isOriginStamp(invocation.origin), true)
      return { content: 'Model faculty result: operational.' }
    },
  })

  const result = await harness.runDiscordMessage('Hey how are you?')

  assert.equal(result.input.platform, 'discord')
  assert.equal(result.output.platform, 'discord')
  assert.equal(result.output.content, 'Model faculty result: operational.')
  assert.equal(result.cortex.arc.id, 'arc-alpha-1')
  assert.equal(result.cortex.arc.state, 'RESOLVED')
  assert.equal(result.cortex.response, 'Model faculty result: operational.')
  assert.deepEqual(result.cortex.trace.map((event) => event.event_type), ['ARC_OPEN', 'ARC_ACTIVE', 'ARC_RESOLVED'])
  assert.deepEqual(replayArcLifecycle(result.cortex.trace).states, ['OPEN', 'ACTIVE', 'RESOLVED'])
  assert.deepEqual(invocations.map((invocation) => invocation.prompt), ['Hey how are you?'])
  assert.deepEqual(traceTypes(result), [
    'FAKE_DISCORD_CHAT_RECEIVED',
    'FAKE_DISCORD_FACULTY_PUBLISH',
    'FAKE_NERVOUS_SYSTEM_RELAY_TO_CORTEX',
    'FAKE_MODEL_FACULTY_INVOKED',
    'FAKE_MODEL_FACULTY_RESULT',
    'CORTEX_ARC_RESOLVED',
    'FAKE_DISCORD_RESPONSE_EMITTED',
  ])
})

test('Alpha MVC harness returns per-message traces when one harness handles multiple messages', async () => {
  const prompts = []
  let arcCount = 0
  const harness = createAlphaMvcHarness({
    createArcId: () => `arc-repeat-${++arcCount}`,
    now: () => 125,
    primeExists: () => true,
    invokeModelFaculty: async (invocation) => {
      prompts.push(invocation.prompt)
      return { content: `response:${invocation.prompt}` }
    },
  })

  const first = await harness.runDiscordMessage('first')
  const second = await harness.runDiscordMessage('second')

  assert.equal(first.output.content, 'response:first')
  assert.equal(second.output.content, 'response:second')
  assert.deepEqual(prompts, ['first', 'second'])
  assert.deepEqual(traceTypes(first), [
    'FAKE_DISCORD_CHAT_RECEIVED',
    'FAKE_DISCORD_FACULTY_PUBLISH',
    'FAKE_NERVOUS_SYSTEM_RELAY_TO_CORTEX',
    'FAKE_MODEL_FACULTY_INVOKED',
    'FAKE_MODEL_FACULTY_RESULT',
    'CORTEX_ARC_RESOLVED',
    'FAKE_DISCORD_RESPONSE_EMITTED',
  ])
  assert.deepEqual(traceTypes(second), [
    'FAKE_DISCORD_CHAT_RECEIVED',
    'FAKE_DISCORD_FACULTY_PUBLISH',
    'FAKE_NERVOUS_SYSTEM_RELAY_TO_CORTEX',
    'FAKE_MODEL_FACULTY_INVOKED',
    'FAKE_MODEL_FACULTY_RESULT',
    'CORTEX_ARC_RESOLVED',
    'FAKE_DISCORD_RESPONSE_EMITTED',
  ])
  assert.equal(second.trace.every((event) => event.arc_id === undefined || event.arc_id === 'arc-repeat-2'), true)
})

test('Alpha MVC harness defaults to unique Arc identity across multiple messages', async () => {
  const harness = createAlphaMvcHarness({
    now: () => 126,
    primeExists: () => true,
    invokeModelFaculty: async (invocation) => ({ content: `response:${invocation.arc_id}` }),
  })

  const first = await harness.runDiscordMessage('first')
  const second = await harness.runDiscordMessage('second')

  assert.equal(first.cortex.arc.id, 'arc-1')
  assert.equal(second.cortex.arc.id, 'arc-2')
  assert.equal(first.output.content, 'response:arc-1')
  assert.equal(second.output.content, 'response:arc-2')
  assert.equal(second.trace.every((event) => event.arc_id === undefined || event.arc_id === 'arc-2'), true)
})

test('Alpha MVC harness simulates Immune floor by failing closed when PRIME is missing', async () => {
  const harness = createAlphaMvcHarness({
    primePath: 'missing/PRIME.md',
    primeExists: () => false,
    invokeModelFaculty: async () => ({ content: 'unreachable' }),
  })

  await assert.rejects(() => harness.runDiscordMessage('Hey'), /PRIME missing: missing\/PRIME\.md/)
})

test('Alpha MVC harness represents irreversible intents as proposals and does not invoke model faculty', async () => {
  let invoked = false
  const harness = createAlphaMvcHarness({
    createArcId: () => 'arc-guard',
    now: () => 124,
    primeExists: () => true,
    invokeModelFaculty: async () => {
      invoked = true
      return { content: 'should not be used' }
    },
  })

  assert.equal(isDeclaredIrreversibleIntent('please delete the database'), true)
  const result = await harness.runDiscordMessage('please delete the database')

  assert.equal(invoked, false)
  assert.equal(result.cortex.arc.state, 'RESOLVED')
  assert.match(result.output.content, /^Proposal only; no irreversible action executed:/)
  assert.equal(traceTypes(result).includes('FAKE_IRREVERSIBLE_GUARD_PROPOSAL'), true)
})

test('carltest --discord command runs the Alpha MVC harness with a fake model response override', () => {
  const output = execFileSync('node', ['bin/carltest.js', '--discord', 'Hey how are you?'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      CARLTEST_FAKE_MODEL_RESPONSE: 'CLI fake model result',
    },
    encoding: 'utf8',
  })
  const parsed = JSON.parse(output)

  assert.equal(parsed.output.platform, 'discord')
  assert.equal(parsed.output.content, 'CLI fake model result')
  assert.equal(parsed.arc.state, 'RESOLVED')
  assert.equal(parsed.trace[0].event_type, 'FAKE_DISCORD_CHAT_RECEIVED')
})
