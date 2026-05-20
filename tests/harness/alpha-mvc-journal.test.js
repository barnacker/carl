import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createAlphaMvcHarness } from '../../dist/harness/alpha-mvc.js'
import {
  createAlphaMvcJournalEvents,
  createAlphaMvcJournalRun,
  readAlphaMvcJournal,
  redactSecrets,
  replayAlphaMvcJournal,
  replayAlphaMvcJournalFile,
} from '../../dist/harness/alpha-mvc-journal.js'
import { createJsonlJournalWriter, readJsonlJournal } from '../../dist/nervous-system/trace/index.js'

function tempTraceDir() {
  return mkdtempSync(join(tmpdir(), 'carl-alpha-mvc-traces-'))
}

function cleanup(path) {
  rmSync(path, { recursive: true, force: true })
}

test('Alpha MVC normal journal writes compact JSONL and replays Arc lifecycle', async () => {
  const dir = tempTraceDir()
  try {
    const harness = createAlphaMvcHarness({
      createArcId: () => 'arc-journal-1',
      now: () => 123,
      primeExists: () => true,
      invokeModelFaculty: async () => ({ content: 'journal response' }),
    })
    const result = await harness.runDiscordMessage('journal message')
    const run = createAlphaMvcJournalRun({
      debugTrace: false,
      traceDir: dir,
      createRunId: () => 'run-test-1',
      createTraceId: () => 'trace-test-1',
      now: () => 123,
    })
    const events = createAlphaMvcJournalEvents({ run, result, now: () => 123 })
    const writer = createJsonlJournalWriter({ path: run.journal_path })
    for (const event of events) writer.append(event)

    assert.equal(existsSync(run.journal_path), true)
    const rawLines = readFileSync(run.journal_path, 'utf8').trim().split(/\r?\n/)
    assert.equal(rawLines.length, events.length)
    assert.equal(rawLines.every((line) => JSON.parse(line).journal_schema === 'alpha-mvc-trace-journal/v0'), true)

    const readBack = readAlphaMvcJournal(run.journal_path)
    const replay = replayAlphaMvcJournal(readBack)
    assert.equal(replay.run_id, 'run-test-1')
    assert.equal(replay.trace_id, 'trace-test-1')
    assert.equal(replay.debug_trace, false)
    assert.deepEqual(replay.arc_lifecycle.states, ['OPEN', 'ACTIVE', 'RESOLVED'])
    assert.equal(replay.arc_lifecycle.terminal_state, 'RESOLVED')
    assert.equal(replay.output?.content, 'journal response')

    const normalText = readFileSync(run.journal_path, 'utf8')
    assert.equal(normalText.includes('journal message'), false)
  } finally {
    cleanup(dir)
  }
})

test('Alpha MVC debug journal includes expanded diagnostics without disabling replay', async () => {
  const dir = tempTraceDir()
  try {
    const harness = createAlphaMvcHarness({
      createArcId: () => 'arc-debug-1',
      now: () => 124,
      primeExists: () => true,
      invokeModelFaculty: async () => ({ content: 'debug response' }),
    })
    const result = await harness.runDiscordMessage('debug message')
    const run = createAlphaMvcJournalRun({
      debugTrace: true,
      traceDir: dir,
      createRunId: () => 'run-debug-1',
      createTraceId: () => 'trace-debug-1',
      now: () => 124,
    })
    const events = createAlphaMvcJournalEvents({ run, result, now: () => 124 })
    const writer = createJsonlJournalWriter({ path: run.journal_path })
    for (const event of events) writer.append(event)

    const debugText = readFileSync(run.journal_path, 'utf8')
    assert.equal(debugText.includes('debug message'), true)
    assert.equal(debugText.includes('debug response'), true)

    const replay = replayAlphaMvcJournalFile(run.journal_path, true)
    assert.equal(replay.debug_trace, true)
    assert.equal(replay.debug_available, true)
    assert.equal(replay.input?.message, 'debug message')
    assert.equal(Array.isArray(replay.events), true)
  } finally {
    cleanup(dir)
  }
})

test('Alpha MVC debug redaction removes secret-like fields and bearer values', () => {
  const redacted = redactSecrets({
    apiKey: 'super-secret-key',
    nested: {
      authorization: 'Bearer abc123',
      token: 'token-value',
      safe: 'visible',
    },
    list: [{ password: 'p4ss' }],
  })

  assert.deepEqual(redacted, {
    apiKey: '[REDACTED]',
    nested: {
      authorization: '[REDACTED]',
      token: '[REDACTED]',
      safe: 'visible',
    },
    list: [{ password: '[REDACTED]' }],
  })
})

test('carltest writes normal journal and replays by both path and trace id', () => {
  const dir = tempTraceDir()
  try {
    const env = {
      ...process.env,
      CARLTEST_FAKE_MODEL_RESPONSE: 'CLI journal result',
      CARLTEST_TRACE_DIR: dir,
      CARLTEST_ARC_HISTORY_PATH: join(dir, 'arc-history.jsonl'),
      CARLTEST_RUN_ID: 'run-cli-1',
      CARLTEST_TRACE_ID: 'trace-cli-1',
      CARLTEST_NOW: '125',
    }
    const output = execFileSync('node', ['bin/carltest.js', '--discord', 'Hey how are you?'], {
      cwd: new URL('../..', import.meta.url),
      env,
      encoding: 'utf8',
    })
    const parsed = JSON.parse(output)

    assert.equal(parsed.run.id, 'run-cli-1')
    assert.equal(parsed.run.trace_id, 'trace-cli-1')
    assert.equal(parsed.run.debug_trace, false)
    assert.equal(parsed.run.journal_path, join(dir, 'trace-cli-1.jsonl'))
    assert.equal(parsed.output.content, 'CLI journal result')
    assert.equal(parsed.trace, undefined)
    assert.equal(existsSync(parsed.run.journal_path), true)

    const byPath = JSON.parse(execFileSync('node', ['bin/carltest.js', '--replay', parsed.run.journal_path], {
      cwd: new URL('../..', import.meta.url),
      env,
      encoding: 'utf8',
    }))
    assert.deepEqual(byPath.arc_lifecycle.states, ['OPEN', 'ACTIVE', 'RESOLVED'])
    assert.equal(byPath.output.content, 'CLI journal result')

    const byId = JSON.parse(execFileSync('node', ['bin/carltest.js', '--replay', 'trace-cli-1'], {
      cwd: new URL('../..', import.meta.url),
      env,
      encoding: 'utf8',
    }))
    assert.deepEqual(byId.arc_lifecycle.states, ['OPEN', 'ACTIVE', 'RESOLVED'])
    assert.equal(byId.trace_id, 'trace-cli-1')
  } finally {
    cleanup(dir)
  }
})

test('carltest debug trace writes expanded journal and reports journal events', () => {
  const dir = tempTraceDir()
  try {
    const env = {
      ...process.env,
      CARLTEST_FAKE_MODEL_RESPONSE: 'CLI debug result',
      CARLTEST_TRACE_DIR: dir,
      CARLTEST_ARC_HISTORY_PATH: join(dir, 'arc-history.jsonl'),
      CARLTEST_RUN_ID: 'run-cli-debug',
      CARLTEST_TRACE_ID: 'trace-cli-debug',
      CARLTEST_NOW: '126',
      CARLTEST_DEBUG_TRACE: '1',
      OPENAI_API_KEY: 'must-not-appear',
    }
    const output = execFileSync('node', ['bin/carltest.js', '--discord', 'Debug check'], {
      cwd: new URL('../..', import.meta.url),
      env,
      encoding: 'utf8',
    })
    const parsed = JSON.parse(output)

    assert.equal(parsed.run.debug_trace, true)
    assert.equal(Array.isArray(parsed.trace), true)
    assert.equal(Array.isArray(parsed.journal_trace), true)
    const journalText = readFileSync(parsed.run.journal_path, 'utf8')
    assert.equal(journalText.includes('Debug check'), true)
    assert.equal(journalText.includes('CLI debug result'), true)
    assert.equal(journalText.includes('must-not-appear'), false)

    const debugReplay = JSON.parse(execFileSync('node', ['bin/carltest.js', '--replay', 'trace-cli-debug', '--debug-trace'], {
      cwd: new URL('../..', import.meta.url),
      env,
      encoding: 'utf8',
    }))
    assert.equal(debugReplay.debug_trace, true)
    assert.equal(debugReplay.input.message, 'Debug check')
    assert.equal(Array.isArray(debugReplay.events), true)
  } finally {
    cleanup(dir)
  }
})

test('carltest recent history lists Arc cards and replay-recent uses displayed handle', () => {
  const dir = tempTraceDir()
  try {
    const baseEnv = {
      ...process.env,
      CARLTEST_FAKE_MODEL_RESPONSE: 'first result',
      CARLTEST_TRACE_DIR: dir,
      CARLTEST_ARC_HISTORY_PATH: join(dir, 'arc-history.jsonl'),
      CARLTEST_NOW: '127',
    }

    execFileSync('node', ['bin/carltest.js', '--discord', 'First bounded request about trace journals'], {
      cwd: new URL('../..', import.meta.url),
      env: {
        ...baseEnv,
        CARLTEST_RUN_ID: 'run-recent-1',
        CARLTEST_TRACE_ID: 'trace-recent-1',
      },
      encoding: 'utf8',
    })
    execFileSync('node', ['bin/carltest.js', '--discord', 'Second bounded request about arc cards'], {
      cwd: new URL('../..', import.meta.url),
      env: {
        ...baseEnv,
        CARLTEST_FAKE_MODEL_RESPONSE: 'second result',
        CARLTEST_RUN_ID: 'run-recent-2',
        CARLTEST_TRACE_ID: 'trace-recent-2',
      },
      encoding: 'utf8',
    })

    const recent = JSON.parse(execFileSync('node', ['bin/carltest.js', '--recent'], {
      cwd: new URL('../..', import.meta.url),
      env: baseEnv,
      encoding: 'utf8',
    }))
    assert.equal(recent.recent.length, 2)
    assert.equal(recent.recent[0].handle, 1)
    assert.equal(recent.recent[0].title, 'Second bounded request about arc cards')
    assert.equal(recent.recent[0].state, 'RESOLVED')
    assert.equal(recent.recent[0].debug, undefined)
    assert.equal(recent.recent[0].trace, undefined)

    const recentDebug = JSON.parse(execFileSync('node', ['bin/carltest.js', '--recent', '--debug-trace'], {
      cwd: new URL('../..', import.meta.url),
      env: baseEnv,
      encoding: 'utf8',
    }))
    assert.equal(recentDebug.recent[0].debug.arc_id, 'arc-trace-recent-2')
    assert.deepEqual(recentDebug.recent[0].debug.relations, [
      {
        dimension: 'CHRONOLOGY',
        relation_type: 'PREVIOUS',
        target_arc_id: 'arc-trace-recent-1',
        direction: 'OUTGOING',
        reason: 'Immediately preceding Arc in local Alpha MVC history.',
        provenance: {
          author: 'CORTEX',
          evidence_refs: [],
        },
        created_at: 127,
      },
    ])

    const replayRecent = JSON.parse(execFileSync('node', ['bin/carltest.js', '--replay-recent', '1'], {
      cwd: new URL('../..', import.meta.url),
      env: baseEnv,
      encoding: 'utf8',
    }))
    assert.equal(replayRecent.trace_id, 'trace-recent-2')
    assert.deepEqual(replayRecent.arc_lifecycle.states, ['OPEN', 'ACTIVE', 'RESOLVED'])
  } finally {
    cleanup(dir)
  }
})

test('Alpha MVC trace journal utility surfaces malformed JSONL lines', () => {
  const dir = tempTraceDir()
  try {
    const path = join(dir, 'bad.jsonl')
    const writer = createJsonlJournalWriter({ path })
    writer.append({ ok: true })
    readFileSync(path, 'utf8')
    execFileSync('node', ['-e', `require('fs').appendFileSync(${JSON.stringify(path)}, '{bad json}\\n')`])

    assert.throws(() => readJsonlJournal(path), /Malformed JSONL trace journal/)
  } finally {
    cleanup(dir)
  }
})

test('runtime trace directory remains ignored', () => {
  const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')
  assert.match(gitignore, /^\/runtime\/$/m)
})
