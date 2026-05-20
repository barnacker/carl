# Alpha MVC 0.03 — Titled Arc Core and Relation Slots Implementation Plan

> Status: reviewed scope / implemented from operator-approved direction.

## Goal

Refactor the core Arc from a mechanical `ArcRecord` shape into a bounded, titled Arc object with lifecycle timestamps, summary, relation slots, and recent-history operator surface.

This phase must not introduce sessions. Arcs may be displayed like chat-sidebar cards, but an Arc is a finite concern/request that resolves when fulfilled.

## Reviewed Decisions

- Use Arc as the core object; avoid a separate session abstraction.
- Treat operator-facing card behavior as part of Arc identity, not only a UI wrapper.
- Keep relation slots open for multiple dimensions.
- Treat `PREVIOUS` as chronology only, not topic/semantic similarity.
- Reserve semantic/topic association for future Faculty work.
- Future Association Faculty may propose relations; Cortex/ArcStore accepts/rejects and stores relation edges.
- 0.03 implements only deterministic chronology/open relation slots, no Memory and no Association Faculty.

## Scope

### In scope

- Add Arc title.
- Add created/activated/resolved timestamps.
- Add Arc summary.
- Add relation schema and relation slots.
- Add deterministic title generation.
- Add chronology `PREVIOUS` relation when prior local Arc history exists.
- Add recent Arc history JSONL index.
- Add `carltest --recent`.
- Add `carltest --recent --debug-trace`.
- Add `carltest --replay-recent <handle>`.
- Hide raw Arc IDs in normal recent output.
- Show raw refs only in debug output.

### Out of scope

- Sessions.
- Continuing resolved Arcs indefinitely.
- Reopening resolved Arcs.
- Semantic relation inference.
- Association Faculty.
- Memory Faculty.
- Embeddings.
- Topic clustering.
- Real Nervous System.
- Real Synapse.
- Real Faculty bus.
- Real Discord.

## Relation Schema Direction

Relation edges are accepted Arc state:

```ts
interface ArcRelation {
  readonly dimension: ArcRelationDimension
  readonly relation_type: ArcRelationType
  readonly target_arc_id: string
  readonly direction: 'OUTGOING' | 'INCOMING' | 'UNDIRECTED'
  readonly reason?: string
  readonly topic?: string
  readonly strength?: number
  readonly confidence?: number
  readonly provenance: ArcRelationProvenance
  readonly created_at: number
}
```

0.03 only writes:

```ts
{
  dimension: 'CHRONOLOGY',
  relation_type: 'PREVIOUS',
  target_arc_id: previousArcId,
  direction: 'OUTGOING',
  provenance: { author: 'CORTEX', evidence_refs: [] }
}
```

## Acceptance Criteria

- `npm run build` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- Existing `carltest --discord` still works.
- `carltest --recent` lists recent titled Arcs.
- `carltest --replay-recent 1` replays the latest Arc.
- Debug recent output includes internal refs and relation edges.
- Normal recent output does not expose raw internal IDs.
- Runtime state remains ignored.
