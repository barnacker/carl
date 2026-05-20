# Alpha MVC 0.04 — Arc-Native Inspection Surface

## Status

Implemented Alpha MVC 0.04 runtime slice.

## Goal

Alpha MVC 0.04 makes the fake-world Cortex harness introspectable through Arc-native, read-only CLI commands before multi-Arc focus behavior is introduced.

The operator can inspect local Alpha MVC state, recent titled Arcs, Arc details, and trace evidence without using generic chat-session vocabulary and without requiring raw internal IDs during normal operation.

## Scope

Real in this iteration:

- `carltest --status` summarizes local Alpha MVC harness state.
- `carltest --arc <handle-or-debug-id>` returns one Arc detail read model.
- `carltest --arc <handle-or-debug-id> --debug-trace` returns debug refs for the same Arc.
- `carltest --trace <trace-id-or-jsonl-path>` returns trace inspection detail.
- Missing Arc handles and malformed traces return structured CLI errors.
- Inspection commands are read-only and do not append Arc history or trace events.

Still fake / harnessed in this iteration:

- Discord ingress.
- Discord Faculty publication.
- Nervous-System relay.
- Model Faculty runtime wrapper.
- Discord-style output.
- Harness-level safety floor.

Out of scope:

- Sessions.
- `SessionStatus` or `session_id`.
- Multi-message chat-thread continuation.
- Reopening resolved Arcs.
- Continuing resolved Arcs indefinitely.
- Arc mutation from inspection commands.
- Semantic relation inference.
- Association Faculty.
- Memory Faculty.
- Embeddings or topic clustering.
- Real Nervous System bus.
- Real Synapse runtime.
- Real Faculty dispatch infrastructure.
- Real Discord integration.

## Commands

Run and record a titled Arc:

```bash
carltest --discord "Inspect an Arc-native read model"
```

Inspect local Alpha MVC status:

```bash
carltest --status
```

Inspect latest recent Arc by handle:

```bash
carltest --arc 1
```

Inspect the same Arc with debug refs:

```bash
carltest --arc 1 --debug-trace
```

Inspect trace evidence by trace ID or JSONL path:

```bash
carltest --trace trace-...
carltest --trace runtime/alpha-mvc/traces/trace-....jsonl
```

Existing 0.03 commands remain available:

```bash
carltest --recent
carltest --recent --debug-trace
carltest --replay-recent 1
carltest --replay trace-...
```

## Read models

Normal operator-facing output hides raw internal references.

`--status` returns:

```json
{
  "status": {
    "runtime": "alpha-mvc",
    "arc_count": 1,
    "latest": {
      "handle": 1,
      "title": "Inspect an Arc-native read model",
      "state": "RESOLVED",
      "summary": "CLI fake model result"
    }
  }
}
```

`--arc 1` returns:

```json
{
  "arc": {
    "handle": 1,
    "title": "Inspect an Arc-native read model",
    "state": "RESOLVED",
    "summary": "CLI fake model result",
    "created_at": 1779238944747,
    "activated_at": 1779238944747,
    "resolved_at": 1779238944747,
    "input": {
      "platform": "discord",
      "channel_id": "cli-harness",
      "preview": "Inspect an Arc-native read model",
      "length": 32
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

`--arc 1 --debug-trace` adds debug refs:

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

`--trace <target>` wraps replay evidence in inspection language:

```json
{
  "trace": {
    "trace_id": "trace-...",
    "run_id": "run-...",
    "debug_trace": false,
    "arc_lifecycle": {
      "states": ["OPEN", "ACTIVE", "RESOLVED"],
      "terminal_state": "RESOLVED"
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

## Failure behavior

Inspection failures produce structured errors on stderr and exit non-zero:

```json
{
  "error": {
    "runtime": "alpha-mvc",
    "message": "Recent Arc handle not found: 99"
  }
}
```

Malformed JSONL traces surface the parse error in the same structure.

## Acceptance

Alpha MVC 0.04 is accepted when tests prove:

- `carltest --status` reports empty history without error.
- `carltest --status` reports latest titled Arc after a run.
- `carltest --arc 1` returns latest Arc detail without raw Arc ID or journal path.
- `carltest --arc 1 --debug-trace` exposes trace refs, Arc ID, origin hash, and relations.
- `carltest --trace <trace-id>` and `carltest --trace <path>` inspect trace detail.
- Unknown handles and malformed traces return structured failures.
- Inspection commands do not append Arc history or trace journals.
- Normal output contains no session terminology or raw Arc ID fields.
- Existing recent/replay behavior remains compatible.
- Runtime files remain ignored.
- No sessions, Memory, Association Faculty, real Nervous System, Synapse, Faculty bus, or Discord runtime is introduced.
