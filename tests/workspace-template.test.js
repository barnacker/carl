import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('..', import.meta.url).pathname

test('workspace-template tracks seed files while runtime workspace remains ignored', () => {
  for (const name of ['PRIME.md', 'PERSONA.md', 'PROTOCOL.md', 'SCHEMA.md', 'AGENTS.yaml']) {
    assert.equal(existsSync(join(root, 'workspace-template', name)), true, name)
  }

  const gitignore = readFileSync(join(root, '.gitignore'), 'utf8')
  assert.match(gitignore, /^\/runtime\/$/m)
  assert.match(gitignore, /^\/workspace\/$/m)
})
