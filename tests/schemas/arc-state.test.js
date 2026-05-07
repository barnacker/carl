import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ARC_STATES, isArcState } from '../../dist/schemas/index.js'

test('Arc states are limited to the five final lifecycle states', () => {
  assert.deepEqual(ARC_STATES, ['OPEN', 'ACTIVE', 'DEFERRED', 'RESOLVED', 'ABSORBED'])
})

test('isArcState rejects obsolete lifecycle states', () => {
  for (const obsolete of ['READY', 'BLOCKED', 'FAILED', 'CANCELLED', 'SUSPENDED', 'WAITING', 'CONFLICT', 'CONTENTION']) {
    assert.equal(isArcState(obsolete), false, obsolete)
  }
})
