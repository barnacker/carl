import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createVllmModel } from '../../dist/model/vllm.js'

test('vllm model posts to chat completions with bearer auth and maps content', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
      text: async () => '',
    }
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
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.model, 'Qwen/Qwen3.8-27B-FP8')
  assert.equal(body.stream, false)
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
    json: async () => {
      throw new Error('should not be called')
    },
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
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
      text: async () => '',
    }
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
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
      text: async () => '',
    }
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
  assert.equal(body.stream, false)
  assert.equal(body.messages.length, 2)
})
