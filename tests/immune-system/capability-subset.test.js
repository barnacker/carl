import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assertCapabilityGrantSubset, isRuntimeActionAllowed } from '../../dist/nervous-system/immune-system/permission-registry/index.js'

const requested = {
  actions: ['READ', 'WRITE', 'QUERY'],
  domains: ['MEMORY'],
  dataClasses: ['OBSERVATION', 'ARC_RECORD'],
  filesystem: {
    read: ['runtime/memory/**'],
    write: ['runtime/memory/observation-log/**']
  },
  network: { outbound: [] },
  secrets: { read: [] },
  resources: {
    maxCpuMsPerArc: 500,
    maxMemoryMb: 256,
    maxOpenFiles: 32,
    maxWallTimeMs: 2000
  }
}

test('grant must be subset of requested capabilities', () => {
  const granted = {
    ...requested,
    actions: ['READ', 'QUERY'],
    dataClasses: ['OBSERVATION'],
    filesystem: { read: ['runtime/memory/**'], write: [] },
    resources: { ...requested.resources, maxCpuMsPerArc: 250 }
  }

  assert.doesNotThrow(() => assertCapabilityGrantSubset(requested, granted))
})

test('grant exceeding request is rejected', () => {
  const granted = {
    ...requested,
    domains: ['MEMORY', 'SYSTEM']
  }

  assert.throws(
    () => assertCapabilityGrantSubset(requested, granted),
    /domains.*SYSTEM/
  )
})

test('runtime action must be inside effective capabilities', () => {
  const effective = {
    ...requested,
    actions: ['READ'],
    filesystem: { read: ['runtime/memory/**'], write: [] }
  }

  assert.equal(isRuntimeActionAllowed(effective, { action: 'READ', domain: 'MEMORY', dataClass: 'OBSERVATION' }), true)
  assert.equal(isRuntimeActionAllowed(effective, { action: 'WRITE', domain: 'MEMORY', dataClass: 'OBSERVATION' }), false)
})
