# Alpha MVC 0.02 — Workspace-backed Trace Journal Implementation Plan

> Status: reviewed scope / implementation-ready after operator approval.
>
> This plan exists because `docs/plans/minimal-viable-cortex-roadmap.md` is a proposal roadmap only. Implement from this reviewed plan, not from the roadmap entry alone.

## Goal

Make Alpha MVC harness evidence durable and replayable across CLI runs while preserving the fake-world boundary introduced in Alpha MVC 0.01.

Alpha MVC 0.02 adds a workspace-backed JSONL trace journal, replay command, tight/default trace mode, and opt-in debug trace mode.

It does **not** implement the real Nervous System, real Synapse, real Faculty bus, real Discord integration, Memory, sessions, or production audit logging.

## Baseline

Alpha MVC 0.01 currently provides:

- `carltest --discord "<message>"` fake Discord ingress.
- Fake Discord and fake Nervous-System relay boundaries.
- Real Cortex trace evidence: `ARC_OPEN → ARC_ACTIVE → ARC_RESOLVED`.
- Harness-invoked model-faculty-shaped adapter.
- Harness-floor PRIME presence and irreversible-action proposal guards.
- In-memory trace evidence and lifecycle replay helper.

## Reviewed Operator Decisions

### Trace detail policy

Use a simple debug switch:

- Normal mode keeps a tight trace.
- Debug mode persists expanded diagnostic details for issue investigation.

Accepted switches:

```bash
carltest --discord "Hey" --debug-trace
```

and environment equivalent:

```bash
CARLTEST_DEBUG_TRACE=1 carltest --discord "Hey"
```

### Replay input

Support both trace IDs and file paths:

```bash
carltest --replay trace-...
```

```bash
carltest --replay runtime/alpha-mvc/traces/trace-....jsonl
```

Implementation priority:

1. Path replay first.
2. Trace ID lookup second.
3. Avoid a complex index unless necessary.

### Journal placement

Keep generic/prototype journal mechanics separate from Alpha MVC semantics.

Recommended files:

- `nervous-system/trace/journal.ts` — prototype JSONL journal utility.
- `harness/alpha-mvc-journal.ts` — Alpha MVC event mapping and replay semantics.

Documentation must state that this is a prototype trace utility, not the real Nervous System audit subsystem.

### Deterministic tests

Runtime may generate IDs and timestamps. Tests must inject deterministic values:

```ts
createRunId: () => 'run-test-1'
createTraceId: () => 'trace-test-1'
now: () => 123
```

## Scope

### In scope

- JSONL trace journal under ignored runtime state.
- Run identity and trace identity.
- CLI output containing `run_id`, `trace_id`, `journal_path`, and `debug_trace`.
- Tight/default trace persistence.
- Debug trace persistence with secret redaction.
- Replay by journal file path.
- Replay by trace ID.
- Replay reconstruction of `ARC_OPEN → ARC_ACTIVE → ARC_RESOLVED`.
- Tests for persistence, replay, trace isolation, deterministic IDs/time, debug-mode payloads, secret redaction, and no runtime-state commits.

### Out of scope

- Real Nervous System bus.
- Real Synapse runtime.
- Real Faculty registration or dispatch.
- Real Discord integration.
- Production audit log.
- Stable production trace schema.
- Session continuity.
- Memory persistence.
- Multi-message session semantics.
- Any committed runtime traces.

## Runtime Storage

Default runtime trace directory:

```text
runtime/alpha-mvc/traces/
```

Example file:

```text
runtime/alpha-mvc/traces/trace-20260519T123456Z-abc123.jsonl
```

Requirements:

- `runtime/` remains gitignored.
- Tests use temporary directories or deterministic ignored runtime paths.
- No runtime trace file is staged or committed.

## Journal Schema

Use provisional schema version `v0` to avoid freezing the production audit format.

```ts
interface AlphaMvcJournalEvent {
  readonly journal_schema: 'alpha-mvc-trace-journal/v0'
  readonly run_id: string
  readonly trace_id: string
  readonly seq: number
  readonly ts: number
  readonly source: 'harness' | 'cortex'
  readonly event_type: string
  readonly boundary: string
  readonly arc_id?: string
  readonly debug: boolean
  readonly payload?: Record<string, unknown>
}
```

### Normal-mode payload policy

Normal mode persists compact evidence only:

- run ID
- trace ID
- sequence
- timestamp
- event type
- boundary
- Arc ID where applicable
- Arc lifecycle state where applicable
- compact fake Discord input metadata
- compact origin identity/hash metadata
- model-faculty invocation/result metadata, not full request internals
- final fake Discord output summary

Avoid in normal mode:

- API endpoint
- API key
- bearer token
- full Hermes config
- full environment
- excessive payload dumps
- unrelated runtime details

### Debug-mode payload policy

Debug mode may persist expanded diagnostics:

- full fake Discord event
- constructed OriginStamp
- model faculty invocation object, excluding secrets
- model faculty result content
- fake Discord output
- harness guard decisions
- replay metadata

Debug mode must still never persist:

- API keys
- bearer tokens
- full `~/.hermes/.env`
- full Hermes config
- unrelated process environment
- secrets from process env

## CLI Behavior

### Normal run

```bash
carltest --discord "Hey how are you?"
```

Candidate output:

```json
{
  "run": {
    "id": "run-...",
    "trace_id": "trace-...",
    "journal_path": "runtime/alpha-mvc/traces/trace-....jsonl",
    "debug_trace": false
  },
  "output": {
    "platform": "discord",
    "channel_id": "cli-harness",
    "content": "..."
  },
  "arc": {
    "id": "arc-1",
    "state": "RESOLVED",
    "target": "Hey how are you?"
  }
}
```

Normal CLI output should omit the full trace array because the journal is the durable trace source.

### Debug run

```bash
carltest --discord "Hey how are you?" --debug-trace
```

Candidate output:

```json
{
  "run": {
    "id": "run-...",
    "trace_id": "trace-...",
    "journal_path": "runtime/alpha-mvc/traces/trace-....jsonl",
    "debug_trace": true
  },
  "output": {
    "platform": "discord",
    "channel_id": "cli-harness",
    "content": "..."
  },
  "arc": {
    "id": "arc-1",
    "state": "RESOLVED",
    "target": "Hey how are you?"
  },
  "trace": [
    "expanded debug trace may be included here"
  ]
}
```

### Replay by path

```bash
carltest --replay runtime/alpha-mvc/traces/trace-....jsonl
```

### Replay by ID

```bash
carltest --replay trace-...
```

Replay output should remain tight by default, even if the journal contains debug-rich records. `--debug-trace` may request expanded replay detail.

Candidate replay output:

```json
{
  "trace_id": "trace-...",
  "run_id": "run-...",
  "debug_trace": false,
  "debug_available": false,
  "arc_lifecycle": {
    "arc_id": "arc-1",
    "event_types": ["ARC_OPEN", "ARC_ACTIVE", "ARC_RESOLVED"],
    "terminal_event_type": "ARC_RESOLVED"
  },
  "input": {
    "platform": "discord",
    "channel_id": "cli-harness"
  },
  "output": {
    "platform": "discord",
    "channel_id": "cli-harness",
    "content": "..."
  }
}
```

## Implementation Tasks

### Task 1: Document 0.02 scope

Files:

- Create: `docs/alpha-mvc-0.02-trace-journal.md`
- Modify: `README.md`
- Optionally modify: `docs/plans/minimal-viable-cortex-roadmap.md`

Acceptance:

- Docs state this is harness evidence, not production audit logging.
- Docs include normal/debug trace distinction.
- Docs include replay by path and trace ID.
- Docs state real Nervous System/Synapse/Faculty bus remain out of scope.

### Task 2: Add prototype JSONL journal utility

Files:

- Create: `nervous-system/trace/journal.ts`
- Modify: `nervous-system/trace/index.ts`

Candidate API:

```ts
interface JsonlJournalWriter<TEvent> {
  append(event: TEvent): void | Promise<void>
  path: string
}

function createJsonlJournalWriter<TEvent>(options: {
  path: string
}): JsonlJournalWriter<TEvent>

function readJsonlJournal<TEvent>(path: string): readonly TEvent[]
```

Acceptance:

- Creates parent directories.
- Writes valid JSONL.
- Reads valid JSONL.
- Rejects or surfaces malformed lines clearly.
- Does not require Alpha MVC imports.

### Task 3: Add Alpha MVC journal mapper

Files:

- Create: `harness/alpha-mvc-journal.ts`

Responsibilities:

- Convert harness trace events to journal events.
- Convert Cortex `TraceEvent` records to journal events.
- Assign `seq` monotonically per run.
- Apply normal/debug payload policy.
- Redact secrets from debug payloads.
- Reconstruct replay summary from journal records.

Acceptance:

- Normal mode yields compact payloads.
- Debug mode yields expanded payloads.
- Secret redaction is tested.
- Replay reconstruction returns lifecycle states and terminal state.

### Task 4: Wire journaling into harness

Files:

- Modify: `harness/alpha-mvc.ts`

Candidate dependency additions:

```ts
interface AlphaMvcHarnessDependencies {
  readonly journal?: AlphaMvcJournalSink
  readonly debugTrace?: boolean
  readonly createRunId?: () => string
  readonly createTraceId?: () => string
}
```

Acceptance:

- Existing tests can run without journaling.
- Journaled runs persist events in order.
- Per-run trace isolation is preserved.
- Default Arc identity remains unique across multiple messages.

### Task 5: Extend CLI normal run

Files:

- Modify: `bin/carltest.js`

Acceptance:

- Supports current command:

  ```bash
  carltest --discord "Hey"
  ```

- Supports debug switch:

  ```bash
  carltest --discord "Hey" --debug-trace
  ```

- Supports environment debug switch:

  ```bash
  CARLTEST_DEBUG_TRACE=1 carltest --discord "Hey"
  ```

- Normal output includes run metadata and omits full trace array.
- Debug output includes expanded trace information.
- Fake model override still works.

### Task 6: Add replay command

Files:

- Modify: `bin/carltest.js`

Acceptance:

- Supports path replay.
- Supports trace ID replay.
- Replay output is tight by default.
- Replay debug output requires `--debug-trace`.
- Missing trace IDs and missing files fail with useful errors.

### Task 7: Tests

Files:

- Create: `tests/harness/alpha-mvc-journal.test.js`
- Modify: `tests/harness/alpha-mvc-harness.test.js` if needed

Test cases:

1. Normal run writes JSONL journal.
2. Debug run writes expanded debug payloads.
3. Debug payload redacts secrets.
4. Replay by path reconstructs `ARC_OPEN → ARC_ACTIVE → ARC_RESOLVED`.
5. Replay by trace ID reconstructs `ARC_OPEN → ARC_ACTIVE → ARC_RESOLVED`.
6. Two runs produce distinct run IDs and trace IDs.
7. Tests can inject deterministic run ID, trace ID, and time.
8. CLI fake model override still works without network/API keys.
9. Runtime trace files are not committed.
10. No real Nervous System, real Synapse, real Faculty bus, or real Discord code is introduced.

## Acceptance Criteria

Alpha MVC 0.02 is accepted when:

1. `carltest --discord "Hey how are you?"` still works.
2. A JSONL trace journal is written under ignored runtime state.
3. CLI output includes `run_id`, `trace_id`, `journal_path`, and `debug_trace`.
4. Normal mode keeps trace output compact.
5. Debug mode persists expanded diagnostic details.
6. Debug mode redacts secrets.
7. Replay works by file path.
8. Replay works by trace ID.
9. Replay reconstructs `ARC_OPEN → ARC_ACTIVE → ARC_RESOLVED`.
10. Separate CLI runs produce distinct run IDs and trace IDs.
11. Tests inject deterministic run ID, trace ID, and time.
12. Tests require no network/API keys.
13. Runtime files are not committed.
14. No real Nervous System, real Synapse, real Faculty bus, real Discord runtime, session layer, or memory layer is introduced.

## Negative Acceptance Criteria

Implementation must not:

- Treat this journal as the final CARL audit log.
- Freeze a production trace schema.
- Store secrets in normal or debug mode.
- Dump full environment/config.
- Require real model calls in tests.
- Introduce a real bus.
- Introduce real Faculty registration.
- Add session semantics.
- Add memory semantics.
- Commit runtime trace files.
- Let replay mutate state.

## Validation Commands

Run before review:

```bash
npm run build
npm run typecheck
npm test
git diff --check
git status --short
```

For CLI smoke tests:

```bash
CARLTEST_FAKE_MODEL_RESPONSE='CLI fake model result' node bin/carltest.js --discord 'Hey how are you?'
CARLTEST_FAKE_MODEL_RESPONSE='CLI fake model result' node bin/carltest.js --discord 'Hey how are you?' --debug-trace
node bin/carltest.js --replay <journal-path>
node bin/carltest.js --replay <trace-id>
```

## Review Notes

This phase intentionally makes trace evidence durable before adding sessions, richer focus cycles, task decomposition, or real Faculty infrastructure. If implementation pressure appears to require one of those concepts, stop and return to operator review instead of expanding 0.02 scope.
