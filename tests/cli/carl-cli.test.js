import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

function runCarl(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['bin/carl.js', ...args], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

test('carl --ask prints the fake model response and exits 0', async () => {
  const { code, stdout } = await runCarl(['--ask', 'ping'], {
    CARL02_FAKE_MODEL_RESPONSE: 'pong',
    PATH: process.env.PATH,
  })
  assert.equal(code, 0)
  assert.match(stdout, /pong/)
})

test('carl --ask without model env fails with bare-cortex error and VLLM_NO_API_KEY', async () => {
  const { code, stderr } = await runCarl(['--ask', 'ping'], {})
  assert.equal(code, 1)
  assert.match(stderr, /error\.runtime=bare-cortex/)
  assert.match(stderr, /VLLM_NO_API_KEY/)
})
