#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createAlphaMvcHarness } from '../dist/harness/alpha-mvc.js'
import {
  appendAlphaMvcArcHistoryRecord,
  createAlphaMvcArcHistoryRecord,
  defaultAlphaMvcArcHistoryPath,
  getRecentAlphaMvcArcByHandle,
  latestAlphaMvcArcHistoryRecord,
  listRecentAlphaMvcArcs,
} from '../dist/harness/alpha-mvc-arc-history.js'
import {
  createAlphaMvcJournalEvents,
  createAlphaMvcJournalRun,
  DEFAULT_ALPHA_MVC_TRACE_DIR,
  replayAlphaMvcJournalFile,
  resolveAlphaMvcJournalPath,
} from '../dist/harness/alpha-mvc-journal.js'
import { createJsonlJournalWriter } from '../dist/nervous-system/trace/index.js'

function usage() {
  console.error('usage: carltest --discord "<message>" [--debug-trace]\n       carltest --replay <trace-id-or-jsonl-path> [--debug-trace]\n       carltest --recent [--debug-trace]\n       carltest --replay-recent <handle> [--debug-trace]')
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
          content: 'You are the current model faculty inside CARL Alpha MVC 0.03. Respond concisely as a faculty result to Cortex.',
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

function isDebugTrace(args) {
  return args.includes('--debug-trace') || process.env.CARLTEST_DEBUG_TRACE === '1'
}

function createNow() {
  if (process.env.CARLTEST_NOW !== undefined) {
    const fixed = Number(process.env.CARLTEST_NOW)
    if (!Number.isFinite(fixed)) {
      throw new Error('CARLTEST_NOW must be a finite number when set')
    }
    return () => fixed
  }
  return () => Date.now()
}

function traceDir() {
  return process.env.CARLTEST_TRACE_DIR ?? DEFAULT_ALPHA_MVC_TRACE_DIR
}

function arcHistoryPath() {
  return process.env.CARLTEST_ARC_HISTORY_PATH ?? defaultAlphaMvcArcHistoryPath(traceDir())
}

function createCliRun(debugTrace, now) {
  return createAlphaMvcJournalRun({
    debugTrace,
    traceDir: traceDir(),
    now,
    ...(process.env.CARLTEST_RUN_ID !== undefined ? { createRunId: () => process.env.CARLTEST_RUN_ID } : {}),
    ...(process.env.CARLTEST_TRACE_ID !== undefined ? { createTraceId: () => process.env.CARLTEST_TRACE_ID } : {}),
  })
}

function arcOutput(arc, debugTrace) {
  return {
    title: arc.title,
    state: arc.state,
    target: arc.target,
    summary: arc.summary,
    created_at: arc.created_at,
    ...(arc.resolved_at !== undefined ? { resolved_at: arc.resolved_at } : {}),
    ...(debugTrace ? {
      id: arc.id,
      relations: arc.relations,
      trace_refs: arc.trace_refs,
    } : {}),
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2))
}

const args = process.argv.slice(2)
const debugTrace = isDebugTrace(args)
const filteredArgs = args.filter((arg) => arg !== '--debug-trace')

try {
  const now = createNow()

  if (filteredArgs[0] === '--recent' && filteredArgs.length === 1) {
    printJson(listRecentAlphaMvcArcs({ path: arcHistoryPath(), includeDebug: debugTrace }))
    process.exit(0)
  }

  if (filteredArgs[0] === '--replay-recent' && typeof filteredArgs[1] === 'string' && filteredArgs.length === 2) {
    const handle = Number(filteredArgs[1])
    const recent = getRecentAlphaMvcArcByHandle({ path: arcHistoryPath(), handle })
    printJson(replayAlphaMvcJournalFile(recent.trace.journal_path, debugTrace))
    process.exit(0)
  }

  if (filteredArgs[0] === '--replay' && typeof filteredArgs[1] === 'string' && filteredArgs.length === 2) {
    const journalPath = resolveAlphaMvcJournalPath(filteredArgs[1], traceDir())
    printJson(replayAlphaMvcJournalFile(journalPath, debugTrace))
    process.exit(0)
  }

  if (filteredArgs[0] !== '--discord' || typeof filteredArgs[1] !== 'string' || filteredArgs[1].length === 0 || filteredArgs.length !== 2) {
    usage()
    process.exit(2)
  }

  const message = filteredArgs[1]
  const historyPath = arcHistoryPath()
  const previous = latestAlphaMvcArcHistoryRecord(historyPath)
  const run = createCliRun(debugTrace, now)
  const harness = createAlphaMvcHarness({
    invokeModelFaculty: invokeCurrentHermesModel,
    primePath: 'workspace-template/PRIME.md',
    primeExists: existsSync,
    now,
    createArcId: () => process.env.CARLTEST_ARC_ID ?? `arc-${run.trace_id}`,
    ...(previous !== undefined ? { previousArcId: previous.debug.arc_id } : {}),
  })
  const result = await harness.runDiscordMessage(message)
  const journalEvents = createAlphaMvcJournalEvents({
    run,
    result,
    now,
  })
  const writer = createJsonlJournalWriter({ path: run.journal_path })
  for (const event of journalEvents) {
    writer.append(event)
  }

  const arcHistoryRecord = createAlphaMvcArcHistoryRecord({ run, result, now })
  appendAlphaMvcArcHistoryRecord(historyPath, arcHistoryRecord)

  printJson({
    run,
    output: result.output,
    arc: arcOutput(result.cortex.arc, debugTrace),
    ...(debugTrace ? { trace: result.trace, journal_trace: journalEvents, arc_history: arcHistoryRecord } : {}),
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
