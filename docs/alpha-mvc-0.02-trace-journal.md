# Alpha MVC 0.02 Trace Journal

## Status

Reviewed Alpha MVC 0.02 runtime slice.

## Goal

Alpha MVC 0.02 makes Alpha MVC harness evidence durable across CLI runs while preserving the fake-world boundary from 0.01.

```text
carltest --discord "Hey how are you?"
→ fake Discord chat event
→ fake Discord Faculty interface
→ fake Nervous-System relay/interface harness
→ real Cortex
→ harness invokes model-faculty-shaped adapter
→ real Cortex resolves Arc
→ JSONL journal records tight trace evidence under runtime/alpha-mvc/traces/
```

## Scope

Real in this iteration:

- Workspace-backed JSONL trace journal.
- Run IDs and trace IDs.
- Replay by trace file path.
- Replay by trace ID.
- Tight default trace mode.
- Opt-in debug trace mode for expanded diagnostics.
- Secret redaction for debug payloads.

Still fake / harnessed in this iteration:

- Discord ingress.
- Discord Faculty publication.
- Nervous-System relay.
- Model Faculty runtime wrapper.
- Discord-style output.
- Harness-level safety floor.

Out of scope:

- Real Discord connection.
- Real Nervous System bus.
- Real Synapse runtime.
- Real Faculty dispatch infrastructure.
- Production audit log.
- Stable production trace schema.
- Memory persistence.
- Sessions or multi-message continuity semantics.

## Commands

Run the harness and write a normal tight journal:

```bash
carltest --discord "Hey how are you?"
```

Run with expanded diagnostic journaling:

```bash
carltest --discord "Hey how are you?" --debug-trace
```

Equivalent environment switch:

```bash
CARLTEST_DEBUG_TRACE=1 carltest --discord "Hey how are you?"
```

Replay by path:

```bash
carltest --replay runtime/alpha-mvc/traces/trace-....jsonl
```

Replay by trace ID:

```bash
carltest --replay trace-...
```

## Trace storage

Default trace directory:

```text
runtime/alpha-mvc/traces/
```

`runtime/` is ignored and must remain uncommitted.

## Trace modes

Normal mode persists compact evidence only:

- run ID
- trace ID
- event sequence
- timestamp
- source boundary
- event type
- Arc ID where applicable
- Arc lifecycle state where applicable
- compact fake Discord metadata
- compact model-faculty metadata
- final fake Discord output content

Debug mode may persist expanded diagnostics:

- full fake Discord event
- model-faculty-shaped invocation details, excluding secrets
- model-faculty result/fake Discord output
- harness guard decisions
- expanded journal events in CLI/replay output

Debug mode must not persist API keys, bearer tokens, full Hermes config, full env files, passwords, or unrelated process environment.

## Boundary warning

The Alpha MVC 0.02 journal is harness evidence only. It is not the final CARL Nervous-System trace implementation and not the production audit log. The schema is intentionally provisional: `alpha-mvc-trace-journal/v0`.

## Acceptance

Alpha MVC 0.02 is accepted when tests prove:

- `carltest --discord "..."` still drives real Cortex through the fake world.
- Normal runs write JSONL under ignored runtime state.
- CLI output includes run ID, trace ID, journal path, and debug flag.
- Debug runs include expanded trace detail and redact secrets.
- Replay by path reconstructs `OPEN → ACTIVE → RESOLVED`.
- Replay by trace ID reconstructs `OPEN → ACTIVE → RESOLVED`.
- Separate runs have isolated trace IDs.
- Tests need no network/API keys.
- No real Nervous System, Synapse, Faculty bus, Discord integration, session layer, or memory layer is introduced.
