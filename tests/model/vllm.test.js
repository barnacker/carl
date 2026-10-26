import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ReadableStream } from 'node:stream/web'

import { createVllmModel, resolveModelConfig } from '../../dist/model/vllm.js'

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

test('vllm model posts to chat completions with NO authorization header and maps content', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return sseResponse([{ content: 'pong' }])
  }

  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8' },
    fakeFetch,
  )
  const reply = await chat([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'ping' },
  ])

  assert.equal(reply, 'pong')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://10.240.232.32:8000/v1/chat/completions')
  assert.ok(!('authorization' in calls[0].init.headers), 'the endpoint is open — no Authorization header is ever sent')
  assert.ok(!('Authorization' in calls[0].init.headers))
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

test('vllm model never sends an Authorization header', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return sseResponse([{ content: 'pong' }])
  }

  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8' },
    fakeFetch,
  )
  const reply = await chat([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'ping' },
  ])

  assert.equal(reply, 'pong')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://10.240.232.32:8000/v1/chat/completions')
  assert.ok(!('authorization' in calls[0].init.headers), 'the endpoint is open — no Authorization header is ever sent')
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
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8' },
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


test('vllm model surfaces a 401 from the open endpoint as an upstream response error, never a keyless-gate error', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 401,
    text: async () => '401 Unauthorized (endpoint is open — upstream rejected regardless)',
  })
  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8' },
    fakeFetch,
  )
  await assert.rejects(
    chat([{ role: 'user', content: 'ping' }]),
    (error) => {
      assert.match(error.message, /401/)
      assert.doesNotMatch(error.message, /VLLM_NO_API_KEY/)
      return true
    },
  )
})

test('vllm model resolves config from env (baseUrl + model only — no auth fields)', async () => {
  const cfg = resolveModelConfig({
    CARL_VLLM_BASE_URL: 'http://127.0.0.1:8000',
    CARL_VLLM_MODEL: 'test/model',
  })
  assert.deepEqual(cfg, { baseUrl: 'http://127.0.0.1:8000', model: 'test/model' })

  const defaults = resolveModelConfig({})
  assert.deepEqual(defaults, {
    baseUrl: 'http://10.240.232.32:8000',
    model: 'Qwen/Qwen3.8-27B-FP8',
  })
})

test('vllm model tags each streamed token with its lane (reasoning vs content) in order', async () => {
  const [fakeFetch, done] = sseFetch([
    JSON.stringify({ choices: [{ delta: { reasoning: 'First thought' } }] }),
    JSON.stringify({ choices: [{ delta: { reasoning: '— second half' } }] }),
    JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }),
    JSON.stringify({ choices: [{ delta: { content: ' world' } }] }),
  ])

  const events = []
  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8' },
    fakeFetch,
  )
  const replyPromise = chat([{ role: 'user', content: 'ping' }], {
    onToken: (tok, lane) => {
      events.push({ tok, lane })
    },
  })

  await done
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(events, [
    { tok: 'First thought', lane: 'reasoning' },
    { tok: '— second half', lane: 'reasoning' },
    { tok: 'Hello', lane: 'content' },
    { tok: ' world', lane: 'content' },
  ])

  const reply = await replyPromise
  assert.equal(reply, 'First thought— second halfHello world')
})

test('vllm model composes the body from params: keys present are sent, absent keys are omitted', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return sseResponse([{ content: 'pong' }])
  }

  const { chat } = createVllmModel(
    { baseUrl: 'http://10.240.232.32:8000', model: 'Qwen/Qwen3.8-27B-FP8' },
    fakeFetch,
  )
  await chat([{ role: 'user', content: 'ping' }], {
    params: { model: 'foo/model', temperature: 0.5 },
  })

  assert.equal(calls.length, 1)
  const body = JSON.parse(calls[0].init.body)
  // Present params win.
  assert.equal(body.model, 'foo/model')
  assert.equal(body.temperature, 0.5)
  // `!= null` guards: absent params are not sent.
  for (const key of ['top_p', 'max_tokens', 'stop', 'presence_penalty', 'frequency_penalty', 'seed', 'n']) {
    assert.ok(!(key in body), `body must not contain ${key} when absent from params`)
  }
  assert.equal(body.stream, true)

  // Full param set: every present key lands in the body.
  calls.length = 0
  await chat([{ role: 'user', content: 'ping' }], {
    params: {
      model: 'foo/model',
      stream: false,
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 42,
      stop: ['A', 'B'],
      presence_penalty: 0.3,
      frequency_penalty: 0.2,
      seed: 7,
      n: 2,
    },
  })
  const full = JSON.parse(calls[0].init.body)
  assert.equal(full.model, 'foo/model')
  assert.equal(full.stream, false)
  assert.equal(full.temperature, 0.1)
  assert.equal(full.top_p, 0.9)
  assert.equal(full.max_tokens, 42)
  assert.deepEqual(full.stop, ['A', 'B'])
  assert.equal(full.presence_penalty, 0.3)
  assert.equal(full.frequency_penalty, 0.2)
  assert.equal(full.seed, 7)
  assert.equal(full.n, 2)
})
