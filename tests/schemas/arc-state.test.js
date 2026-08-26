import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ARC_STATES, isArcState } from '../../dist/schemas/index.js'

test('ArcState is the derived presentation set', () => {
  assert.deepEqual(ARC_STATES, ['ENGAGED', 'INCUBATING', 'INHIBITED', 'RESOLVED', 'ABSORBED'])
})

test('isArcState rejects obsolete stored lifecycle labels', () => {
  for (const obsolete of ['OPEN', 'ACTIVE', 'READY', 'BLOCKED', 'FAILED', 'CANCELLED', 'SUSPENDED', 'WAITING', 'CONFLICT', 'CONTENTION']) {
    assert.equal(isArcState(obsolete), false, obsolete)
  }
})
