import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ReadableStream } from 'node:stream/web'

import { createVllmModel } from '../../dist/model/vllm.js'

function sseResponse(payloads) {
  const encoder = new TextEncoder()
  const frames = payloads.map((p) => `data: ${JSON.stringify({ choices: [{ delta: p }] })}\n\n`)
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`${frames.join('')}data: [DONE]\n\n`))
        controller.close()
      },
    }),
  }
}

function sseFetch(payloads) {
  let resolveDone
  const done = new Promise((resolve) => {
    resolveDone = resolve
  })
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      controller.close()
      resolveDone()
    },
  })
  const fakeFetch = async (url, init) => ({ url, init, ok: true, status: 200, body: stream })
  return [fakeFetch, done]
}

test('vllm model streams SSE tokens to onToken in order and resolves with the concatenation', async () => {
  const [fakeFetch, done] = sseFetch([
    JSON.stringify({ choices: [{ delta: { reasoning: 'thinking…' } }] }),
    JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
    JSON.stringify({ choices: [{ delta: { reasoning: 'now I do' } }] }),
    JSON.stringify({ choices: [{ delta: { content: 'lo ' } }] }),
    JSON.stringify({ choices: [{ delta: { content: 'world' } }] }),
  ])

  const tokens = []
  const events = []
  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8', apiKey: 'test-key' },
    fakeFetch,
  )
  const startedAt = Date.now()
  const replyPromise = chat([{ role: 'user', content: 'ping' }], {
    onToken: (tok) => {
      // Record at emission time, before anything else runs: proves the
      // callback fires per-chunk in arrival order on the real pipe.
      tokens.push(tok)
      events.push({ tok, seq: tokens.length - 1, at: Date.now() })
    },
  })

  // The stream emits every chunk + [DONE] long before chat() settles on the
  // last one: proving the callback fired per-chunk, not one buffered read at
  // the end.
  await done
  // Drain the event-loop queue so the last chunk's callback has run before
  // we check.
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(tokens, ['thinking…', 'Hel', 'now I do', 'lo ', 'world'])
  events.forEach((event, index) => {
    assert.equal(event.seq, index)
    assert.ok(event.at >= startedAt, 'token timestamp precedes stream start')
  })
  for (let index = 0; index < events.length - 1; index += 1) {
    assert.ok(events[index].at <= events[index + 1].at, 'tokens not monotonic in arrival order')
  }

  const reply = await replyPromise
  assert.equal(reply, 'thinking…Helnow I dolo world')
})

test('vllm model posts to chat completions with bearer auth and maps content', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return sseResponse([{ content: 'pong' }])
  }

  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8', apiKey: 'test-key-123' },
    fakeFetch,
  )
  const reply = await chat([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'ping' },
  ])

  assert.equal(reply, 'pong')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://10.240.232.32:8000/v1/chat/completions')
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-key-123')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.equal(calls[0].init.headers.accept, 'text/event-stream')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.model, 'Qwen/Qwen3.8-27B-FP8')
  assert.equal(body.stream, true)
  assert.equal(body.messages.length, 2)
  for (const message of body.messages) {
    assert.equal(typeof message.role, 'string')
    assert.equal(typeof message.content, 'string')
  }
})

test('vllm model rejects non-2xx responses with status and body', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 500,
    text: async () => '{"error":"boom"}',
  })

  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8', apiKey: 'test-key-123' },
    fakeFetch,
  )
  await assert.rejects(
    chat([{ role: 'user', content: 'ping' }]),
    (error) => {
      assert.match(error.message, /500/)
      assert.match(error.message, /boom/)
      return true
    },
  )
})

test('vllm model rejects without calling fetch when api key is missing', async () => {
  let fetchCalled = false
  const fakeFetch = async () => {
    fetchCalled = true
    return sseResponse([])
  }
  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8' },
    fakeFetch,
  )
  await assert.rejects(
    chat([{ role: 'user', content: 'ping' }]),
    (error) => {
      assert.match(error.message, /VLLM_NO_API_KEY/)
      return true
    },
  )
  assert.equal(fetchCalled, false)
})

test('vllm model omits authorization header and calls fetch when no auth flag is set', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return sseResponse([{ content: 'pong' }])
  }

  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8', noAuth: true },
    fakeFetch,
  )
  const reply = await chat([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'ping' },
  ])

  assert.equal(reply, 'pong')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://10.240.232.32:8000/v1/chat/completions')
  assert.ok(!('authorization' in calls[0].init.headers))
  assert.ok(!('Authorization' in calls[0].init.headers))
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.model, 'Qwen/Qwen3.8-27B-FP8')
  assert.equal(body.stream, true)
  assert.equal(body.messages.length, 2)
})

test('vllm model rejects empty streamed responses', async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\ndata: [DONE]\n\n`))
        controller.close()
      },
    }),
  })
  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8', apiKey: 'test-key' },
    fakeFetch,
  )
  await assert.rejects(
    chat([{ role: 'user', content: 'ping' }]),
    (error) => {
      assert.match(error.message, /VLLM_BAD_RESPONSE/)
      return true
    },
  )
})

