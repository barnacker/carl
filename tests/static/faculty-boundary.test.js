import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function walk(dir) {
  const entries = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) entries.push(...walk(path))
    else if (path.endsWith('.ts')) entries.push(path)
  }
  return entries
}

test('Faculty source does not import Cortex or Nervous System internals', () => {
  const files = walk(new URL('../../faculties', import.meta.url).pathname)
  assert.ok(files.length > 0, 'expected faculty source files')

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /from ['\"](?:\.\.\/)+(?:nervous-system|cortex)\//, file)
    assert.doesNotMatch(text, /from ['\"]\/(?:nervous-system|cortex)\//, file)
  }
})
