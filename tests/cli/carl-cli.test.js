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

test('carl --ask streams from the open vLLM endpoint (no auth-gate: no VLLM_NO_API_KEY, never a keyless refusal)', async () => {
  const { code, stdout, stderr } = await runCarl(['--ask', 'ping'], {})
  // The endpoint is open and reachable from the box: the request must NOT
  // be gated before fetch (no VLLM_NO_API_KEY) and must stream a real reply.
  assert.doesNotMatch(stderr, /VLLM_NO_API_KEY/)
  assert.equal(code, 0)
  assert.ok(stdout.length > 0)
})
