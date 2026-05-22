# Alpha MVC 0.04 — Arc-Native Inspection Surface Implementation Plan

> Status: implemented on `master` from operator-reviewed scope.

## Goal

Make the Alpha MVC harness introspectable through Arc-native read-only tooling before adding multi-Arc focus behavior.

Alpha MVC 0.04 must let an operator inspect what CARL just did, which bounded Arc was created, what trace evidence exists, and what resolution output was produced without requiring raw internal IDs in normal use.

This phase must not introduce sessions. CARL's bounded continuity object remains the titled Arc.

## Reviewed Decisions

- Use Arc-native inspection vocabulary, not generic chat session vocabulary.
- `--status` means current Alpha MVC harness status and recent Arc summary, not a session status.
- Operator-facing commands use recent handles and titles by default.
- Raw Arc IDs, trace IDs, journal paths, and relation internals remain debug-oriented.
- Inspection is read-only. It must not reopen, continue, mutate, merge, absorb, or create Arcs.
- ArcState vocabulary is derived: `ENGAGED`, `DEFERRED`, `RESOLVED`, `ABSORBED`. Trace events carry lifecycle evidence such as `ARC_OPEN`, `ARC_ACTIVE`, and `ARC_RESOLVED`.
- 0.04 does not introduce Memory, Association Faculty, real Nervous System, Synapse runtime, real Faculty bus, or Discord integration.

## Scope

### In scope

- Add `carltest --status`.
- Add `carltest --arc <handle-or-debug-id>`.
- Add `carltest --arc <handle-or-debug-id> --debug-trace`.
- Add `carltest --trace <trace-id-or-jsonl-path>` as an explicit trace inspection alias or read-model wrapper around replay semantics.
- Keep `carltest --recent` and `carltest --replay-recent <handle>` compatible.
- Define stable Alpha MVC read models for:
  - status summary;
  - Arc index entry;
  - Arc detail;
  - trace detail.
- Test missing handles, unknown Arc IDs, malformed trace files, empty recent history, and debug-vs-normal output boundaries.
- Document command behavior and read-model fields.

### Out of scope

- Sessions.
- `--status <session-id>`.
- Multi-message chat-thread continuation.
- Reopening resolved Arcs.
- Continuing resolved Arcs indefinitely.
- Arc mutation from inspection commands.
- Semantic relation inference.
- Association Faculty.
- Memory Faculty.
- Embeddings.
- Topic clustering.
- Real Nervous System bus.
- Real Synapse runtime.
- Real Faculty dispatch infrastructure.
- Real Discord integration.

## Command Contract

### `carltest --status`

Returns a compact read-only summary of the local Alpha MVC harness state.

Normal output should include:

```json
{
  "status": {
    "runtime": "alpha-mvc",
    "arc_count": 2,
    "latest": {
      "handle": 1,
      "title": "Review the trace journal implementation",
      "state": "RESOLVED",
      "summary": "CLI fake model result"
    }
  }
}
```

Empty history should be valid and explicit:

```json
{
  "status": {
    "runtime": "alpha-mvc",
    "arc_count": 0,
    "latest": null
  }
}
```

### `carltest --arc <handle-or-debug-id>`

Returns one Arc detail read model. Normal output must not require or expose raw internal references.

Handle lookup uses the same ordering as `--recent`: handle `1` is the latest Arc.

Normal output should include:

```json
{
  "arc": {
    "handle": 1,
    "title": "Review the trace journal implementation",
    "state": "RESOLVED",
    "summary": "CLI fake model result",
    "created_at": 1779238944747,
    "activated_at": 1779238944747,
    "resolved_at": 1779238944747,
    "input": {
      "platform": "discord",
      "channel_id": "cli-harness",
      "preview": "Review the trace journal implementation",
      "length": 39
    },
    "output": {
      "platform": "discord",
      "channel_id": "cli-harness",
      "preview": "CLI fake model result",
      "length": 21
    }
  }
}
```

Debug output may add:

```json
{
  "trace": {
    "run_id": "run-...",
    "trace_id": "trace-...",
    "journal_path": "runtime/alpha-mvc/traces/trace-....jsonl"
  },
  "debug": {
    "arc_id": "arc-...",
    "origin_hash": "fake-discord:cli-harness:operator",
    "relations": []
  }
}
```

### `carltest --trace <trace-id-or-jsonl-path>`

Returns trace detail in inspection form. It may reuse the existing replay reader internally, but the command contract is inspection/read-model language.

Normal output should include:

```json
{
  "trace": {
    "trace_id": "trace-...",
    "run_id": "run-...",
    "debug_trace": false,
    "arc_lifecycle": {
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
      "content": "CLI fake model result"
    }
  }
}
```

## Read Model Rules

- Normal read models use handles, titles, lifecycle states, summaries, timestamps, compact input/output previews, and counts.
- Debug read models may include raw Arc IDs, trace IDs, journal paths, origin hashes, and relation edges.
- Normal Arc inspection must not expose raw Arc IDs.
- Normal recent/status output must not expose journal paths.
- Malformed trace files must return a structured error and non-zero exit from CLI.
- Missing handles or IDs must return a structured not-found error and non-zero exit from CLI.
- Empty history is not an error for `--status` or `--recent`.

## Negative Acceptance Criteria

The implementation is invalid if it:

- introduces a `session` schema, `SessionStatus`, or `session_id` field;
- adds `carltest --status <session-id>`;
- mutates Arc state from `--status`, `--arc`, or `--trace`;
- creates, reopens, continues, absorbs, or relates Arcs from inspection commands;
- adds states outside `OPEN`, `ACTIVE`, `DEFERRED`, `RESOLVED`, `ABSORBED`;
- implements Memory, Association Faculty, embeddings, topic clustering, real Nervous System, real Synapse, real Faculty bus, or Discord runtime;
- exposes raw Arc IDs in normal operator-facing Arc output.

## Implementation Notes

- Prefer extending `harness/alpha-mvc-arc-history.ts` for read-model helpers rather than scattering JSONL parsing through the CLI.
- Keep generic JSONL trace reading separate from Alpha MVC Arc-history semantics.
- Preserve existing `--recent` and `--replay-recent` behavior.
- Use deterministic test IDs/time for CLI tests where possible.
- Keep runtime files under ignored `runtime/` state.

## Tests

Add or update tests proving:

- `carltest --status` reports empty history without error.
- `carltest --status` reports latest titled Arc after a run.
- `carltest --arc 1` returns latest Arc detail without raw Arc ID.
- `carltest --arc 1 --debug-trace` exposes debug refs and relations.
- `carltest --trace <trace-id>` inspects trace detail.
- `carltest --trace <path>` inspects trace detail.
- Unknown handle returns structured not-found error and non-zero exit.
- Malformed trace file returns structured parse error and non-zero exit.
- Inspection commands do not append to recent history or trace journals.
- Normal output contains no `session`, `session_id`, or raw Arc ID fields.

## Validation Gates

```bash
npm run build
npm run typecheck
npm test
git diff --check
```

0.04 CLI smoke after implementation:

```bash
CARLTEST_FAKE_MODEL_RESPONSE='CLI fake model result' \
CARLTEST_TRACE_ID='trace-0-04-smoke' \
CARLTEST_RUN_ID='run-0-04-smoke' \
node bin/carltest.js --discord 'Inspect an Arc-native read model'
node bin/carltest.js --status
node bin/carltest.js --arc 1
node bin/carltest.js --arc 1 --debug-trace
node bin/carltest.js --trace trace-0-04-smoke
node bin/carltest.js --replay-recent 1
```

## Acceptance Criteria

Alpha MVC 0.04 is accepted when:

- `carltest --status` summarizes local Alpha MVC harness state without session terminology.
- `carltest --arc <handle>` returns an Arc detail read model.
- `carltest --arc <handle> --debug-trace` returns the same Arc with debug references.
- `carltest --trace <trace-id-or-jsonl-path>` returns trace inspection detail.
- Missing and malformed inputs are structured, tested failures.
- Normal operator-facing output hides raw Arc IDs and journal paths.
- Inspection commands are read-only.
- Existing 0.03 recent/replay behavior still works.
- Runtime files remain ignored.
- No sessions, Memory, Association Faculty, real Nervous System, Synapse, Faculty bus, or Discord runtime is introduced.
