import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isAllowedHost } from '../../dist/faculties/dash.js'

test('isAllowedHost accepts 127.0.0.1, localhost, hermes — with or without a port', () => {
  assert.equal(isAllowedHost('127.0.0.1'), true)
  assert.equal(isAllowedHost('127.0.0.1:3000'), true)
  assert.equal(isAllowedHost('127.0.0.1:8080'), true)
  assert.equal(isAllowedHost('localhost'), true)
  assert.equal(isAllowedHost('localhost:3000'), true)
  assert.equal(isAllowedHost('hermes'), true)
  assert.equal(isAllowedHost('hermes:3000'), true)
  assert.equal(isAllowedHost('hermes:8080'), true)
})

test('isAllowedHost rejects external IPs, other hostnames, subdomains, and missing values', () => {
  assert.equal(isAllowedHost('example.com'), false)
  assert.equal(isAllowedHost('example.com:3000'), false)
  assert.equal(isAllowedHost('10.0.0.5'), false)
  assert.equal(isAllowedHost('10.0.0.5:3000'), false)
  assert.equal(isAllowedHost('0.0.0.0:3000'), false)
  assert.equal(isAllowedHost(''), false)
  assert.equal(isAllowedHost(undefined), false)
  // no subdomains of hermes — only the bare name (operator addendum: one accepted name)
  assert.equal(isAllowedHost('hermes.evil.example.com'), false)
  assert.equal(isAllowedHost('evil-hermes:3000'), false)
})
