#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createAlphaMvcHarness } from '../dist/harness/alpha-mvc.js'

function usage() {
  console.error('usage: carltest --discord "<message>"')
}

function readDotEnv(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    if (!key) continue
    values[key] = rest.join('=').replace(/^['"]|['"]$/g, '')
  }
  return values
}

function readHermesModelConfig() {
  const configPath = join(homedir(), '.hermes', 'config.yaml')
  const result = {
    baseUrl: process.env.HERMES_CARL_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL,
    model: process.env.HERMES_CARL_MODEL ?? process.env.OPENAI_MODEL,
  }
  if (!existsSync(configPath)) return result

  const text = readFileSync(configPath, 'utf8')
  const modelLines = []
  let inModel = false
  for (const line of text.split(/\r?\n/)) {
    if (line === 'model:') {
      inModel = true
      continue
    }
    if (inModel && /^\S/.test(line)) break
    if (inModel) modelLines.push(line)
  }
  const modelBlock = modelLines.join('\n')
  const baseUrl = modelBlock.match(/^\s+base_url:\s*(.+)$/m)?.[1]?.trim()
  const model = modelBlock.match(/^\s+default:\s*(.+)$/m)?.[1]?.trim()
  return {
    baseUrl: result.baseUrl ?? baseUrl,
    model: result.model ?? model,
  }
}

async function invokeCurrentHermesModel(invocation) {
  if (process.env.CARLTEST_FAKE_MODEL_RESPONSE !== undefined) {
    return { content: process.env.CARLTEST_FAKE_MODEL_RESPONSE }
  }

  const env = {
    ...readDotEnv(join(homedir(), '.hermes', '.env')),
    ...process.env,
  }
  const { baseUrl, model } = readHermesModelConfig()
  const apiKey = env.HERMES_CARL_MODEL_API_KEY
    ?? env.AZURE_FOUNDRY_API_KEY
    ?? env.OPENAI_API_KEY

  if (!baseUrl || !model || !apiKey) {
    throw new Error('Missing model configuration. Need base_url/model plus HERMES_CARL_MODEL_API_KEY, AZURE_FOUNDRY_API_KEY, or OPENAI_API_KEY.')
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are the current model faculty inside CARL Alpha MVC 0.01. Respond concisely as a faculty result to Cortex.',
        },
        {
          role: 'user',
          content: invocation.prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Model faculty call failed: HTTP ${response.status} ${text.slice(0, 500)}`)
  }

  const json = await response.json()
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('Model faculty response missing choices[0].message.content')
  }
  return { content }
}

const flag = process.argv[2]
const message = process.argv[3]
if (flag !== '--discord' || typeof message !== 'string' || message.length === 0 || process.argv.length > 4) {
  usage()
  process.exit(2)
}

try {
  const harness = createAlphaMvcHarness({
    invokeModelFaculty: invokeCurrentHermesModel,
    primePath: 'workspace-template/PRIME.md',
    primeExists: existsSync,
  })
  const result = await harness.runDiscordMessage(message)
  console.log(JSON.stringify({
    output: result.output,
    arc: {
      id: result.cortex.arc.id,
      state: result.cortex.arc.state,
      target: result.cortex.arc.target,
    },
    trace: result.trace,
  }, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
