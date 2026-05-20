# Alpha MVC 0.03 — Titled Arc Core and Relation Slots

## Status

Reviewed Alpha MVC 0.03 runtime slice.

## Goal

Alpha MVC 0.03 upgrades the core Arc from a mechanical lifecycle record into a bounded, titled concern/request that can be shown as an operator-facing card while remaining finite and resolvable.

An Arc is not a chat session. It may look like a titled chat-sidebar entry, but it has stricter semantics:

- it represents one bounded concern/request;
- it has lifecycle state;
- it has trace evidence;
- it resolves when fulfilled;
- it does not keep spinning forever.

## Scope

Real in this iteration:

- Core Arc schema includes title, summary, lifecycle timestamps, and relation slots.
- ArcStore creates deterministic titles without an extra model call.
- ArcStore records deterministic chronology relation edges when a previous Arc exists.
- CLI writes a compact recent Arc history index under ignored runtime state.
- Operator can list recent Arcs through display handles rather than raw Arc IDs.
- Operator can replay a recent Arc by handle.
- Debug mode exposes raw Arc IDs, trace refs, journal paths, and relations.

Still fake / harnessed in this iteration:

- Discord ingress.
- Discord Faculty publication.
- Nervous-System relay.
- Model Faculty runtime wrapper.
- Discord-style output.
- Harness-level safety floor.

Out of scope:

- Sessions.
- Endless chat-thread continuation.
- Reopening resolved Arcs.
- Semantic/topic relation inference.
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
carltest --discord "Review the trace journal implementation"
```

List recent Arc cards:

```bash
carltest --recent
```

List recent Arc cards with debug refs and relations:

```bash
carltest --recent --debug-trace
```

Replay by recent handle:

```bash
carltest --replay-recent 1
```

Existing trace replay remains available:

```bash
carltest --replay <trace-id-or-jsonl-path>
```

## Arc relation model

Relations are stored as accepted Arc edges. Future faculties may propose relations, but Cortex/ArcStore remains the owner of accepted Arc state.

0.03 only creates deterministic chronology relations:

```json
{
  "dimension": "CHRONOLOGY",
  "relation_type": "PREVIOUS",
  "target_arc_id": "arc-...",
  "direction": "OUTGOING"
}
```

This means only: this Arc came after another Arc. It does not imply shared topic, memory, or semantic similarity.

Future dimensions may include:

- `TOPIC`
- `INTENT`
- `WORKFLOW`
- `DERIVATION`
- `CONFLICT`
- `DUPLICATION`
- `REFERENCE`
- `CAUSALITY`

## Future Association Faculty

A future Association Faculty may propose multi-dimensional relation edges using evidence from titles, summaries, traces, and Memory. The proposal flow should be:

```text
Association Faculty proposes relation
→ Cortex evaluates relation proposal
→ ArcStore records accepted relation
→ trace records accepted/rejected decision
```

0.03 does not implement that faculty.

## Recent Arc history

Recent Arc history is stored under ignored runtime state:

```text
runtime/alpha-mvc/arc-history.jsonl
```

Normal output hides raw internal references. Debug output exposes them for diagnosis.

## Acceptance

Alpha MVC 0.03 is accepted when tests prove:

- Arcs have deterministic titles.
- Arcs have created/activated/resolved timestamps.
- Arcs have summary fields.
- Arcs have relation slots.
- A second CLI Arc records a `CHRONOLOGY/PREVIOUS` relation to the prior Arc.
- `carltest --recent` shows operator-facing handles/titles without raw IDs.
- `carltest --recent --debug-trace` shows raw IDs, trace refs, journal paths, and relations.
- `carltest --replay-recent <handle>` replays the selected Arc.
- Existing journal replay continues to work.
- Runtime files remain ignored.
- No sessions, Memory, Association Faculty, real Nervous System, Synapse, Faculty bus, or Discord runtime is introduced.
