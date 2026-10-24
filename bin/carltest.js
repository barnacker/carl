#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createAlphaMvcHarness } from '../dist/harness/alpha-mvc.js'
import {
  appendAlphaMvcArcHistoryRecord,
  createAlphaMvcArcDetailReadModel,
  createAlphaMvcArcHistoryRecord,
  createAlphaMvcStatusReadModel,
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
import { createVllmModel, resolveModelConfig } from '../dist/model/vllm.js'
import { deriveArcState } from '../dist/schemas/arc.js'

function usage() {
  console.error('usage: carltest --discord "<message>" [--debug-trace]\n       carltest --status\n       carltest --arc <handle-or-debug-id> [--debug-trace]\n       carltest --trace <trace-id-or-jsonl-path> [--debug-trace]\n       carltest --replay <trace-id-or-jsonl-path> [--debug-trace]\n       carltest --recent [--debug-trace]\n       carltest --replay-recent <handle> [--debug-trace]')
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

async function invokeCurrentHermesModel(invocation) {
  if (process.env.CARLTEST_FAKE_MODEL_RESPONSE !== undefined) {
    return { content: process.env.CARLTEST_FAKE_MODEL_RESPONSE }
  }

  const { chat } = createVllmModel(resolveModelConfig(process.env))
  const content = await chat([
    { role: 'system', content: 'You are the current model faculty inside CARL Alpha MVC 0.03. Respond concisely as a faculty result to Cortex.' },
    { role: 'user', content: invocation.prompt },
  ])
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
    state: deriveArcState(arc),
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

function salienceOutput(salience) {
  return {
    total: salience.total,
    terms: salience.terms.map((term) => ({
      name: term.name,
      value: term.value,
      reason: term.reason,
    })),
  }
}

function focusCycleOutput(focusCycle, debugTrace) {
  return {
    ruleset: focusCycle.ruleset,
    candidates: focusCycle.candidates.map((candidate) => ({
      title: candidate.title,
      presentation_state: candidate.presentationState,
      state: candidate.state,
      salience: salienceOutput(candidate.salience),
      ...(debugTrace ? { arc_id: candidate.arcId } : {}),
    })),
    decision: {
      selected_title: focusCycle.decision.selectedTitle,
      selected_state: focusCycle.decision.selectedState,
      faculty_id: focusCycle.decision.facultyId,
      faculty_role: focusCycle.decision.facultyRole,
      reason: focusCycle.decision.reason,
      salience: salienceOutput(focusCycle.decision.salience),
      ...(debugTrace ? { selected_arc_id: focusCycle.decision.arcId } : {}),
    },
    ...(debugTrace ? { cycle_id: focusCycle.cycleId } : {}),
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2))
}

function printStructuredError(error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({
    error: {
      runtime: 'alpha-mvc',
      message,
    },
  }, null, 2))
}

function traceInspectionOutput(target, debugTrace) {
  const journalPath = resolveAlphaMvcJournalPath(target, traceDir())
  const replay = replayAlphaMvcJournalFile(journalPath, debugTrace)
  if (debugTrace) {
    return { trace: replay }
  }
  const { arc_id: _arcId, ...arcLifecycle } = replay.arc_lifecycle
  return {
    trace: {
      ...replay,
      arc_lifecycle: arcLifecycle,
    },
  }
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

  if (filteredArgs[0] === '--status' && filteredArgs.length === 1) {
    printJson(createAlphaMvcStatusReadModel({ path: arcHistoryPath() }))
    process.exit(0)
  }

  if (filteredArgs[0] === '--arc' && typeof filteredArgs[1] === 'string' && filteredArgs.length === 2) {
    printJson(createAlphaMvcArcDetailReadModel({
      path: arcHistoryPath(),
      handleOrDebugId: filteredArgs[1],
      includeDebug: debugTrace,
    }))
    process.exit(0)
  }

  if (filteredArgs[0] === '--trace' && typeof filteredArgs[1] === 'string' && filteredArgs.length === 2) {
    printJson(traceInspectionOutput(filteredArgs[1], debugTrace))
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
    ...(debugTrace ? {
      focus_cycle: focusCycleOutput(result.cortex.focusCycle, debugTrace),
      trace: result.trace,
      journal_trace: journalEvents,
      arc_history: arcHistoryRecord,
    } : {}),
  })
} catch (error) {
  printStructuredError(error)
  process.exit(1)
}
