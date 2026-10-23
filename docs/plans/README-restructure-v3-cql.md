# README Restructure — v3 CQL (rewrite pivot, operator-locked 2026-10-20)

Status: **REWRITTEN.** The operator seeded the intro ("Don't see it as a new Agent..."), and the review stream pivoted from a restructure-with-explanation to a **CQL** (cognitive quality lock) **rewrite**: no disclaimers, no definition padding, no "we now do X where before we did Y" scaffolding. The operator owns every sentence. This doc is the audit trail of the pivot, not a proposal.

House style: plain, compact, team-readable. One path. No coined jargon. Table over nested bullets. Every section must earn its length.

## The framing problem (why the old README lost the reader)

Old README opened with: security-claim disclaimer, biology-naming disclaimer, a reading map, a 9-row comparison table, 3 anticipated objections, then a taxonomy of two inhibition words — before the reader knew what CARL does with a message. The Arc (the defining object) appeared at line 231 and was re-explained three times; no end-to-end signal-flow story existed.

Fix applied: open with what CARL is, THEN the Arc as §1 (the tracker), then one message end-to-end, then the components the path runs on. No glossary. No comparison table.

## Final structure (operator-locked 2026-10-20)

Nine chapters, numbered. The operator's copyseed decides every line: the agent's job is ordering + plain words + no coined terms + no disclaimers + one path. The sections below are the lock-list, not a spec.

1. **The Cortex** — the brain. The harness (brain, identity, Arc store, orienting loop = "consciousness"). The Arcs live *inside* the Cortex (Arc is a component of it). Model access is only via the **reasoning engine**.
2. **The Arc** — a component of the Cortex. Story arc, in the feel of a TV series: beginning, tension, resolution, ending. Five states: INCUBATING / ENGAGED / INHIBITED / RESOLVED / ABSORBED. Plan maturity: UNDECOMPOSED → PLANNED → EXECUTING → RESOLVED. Budget on the Arc.
3. **The Nervous System** — the backbus: brain + brain + **Reflex (curvature: curvature in the first position so it saturates there)**. Everything is "inner-syne" (corner, whatever).
4. **The Faculties** — Sensory / Execution / Infrastructure. **MAX-AONE-NONE**: a chunk can never access other than its own brain space. No direct gallery-import path.
5. **The Reflex** — **intention** saved: the off-cortex, off-model, zero-token replay path. *Not* a Learner-A, *not* a hallway-ctor. Zero-model, zero-cost fast path. `REFLEX_DEGRADED` to Rescue-A on confidence/Risk/fail.
6. **The Players** — system in operation. Players: Orienting Loop,_arc, Persona, NS + Gate, Fastpath, Sensory, Execution, Memory Faculty. Who lives where. Who talks to whom. One message end-to-end.
7. **Laws** — 12, one line each, from original spec. Enforcement map in SPEC.
8. **Building CARL** — 5 stages. **CQL weight on Reflex path** (corpus, decay, crash-dump, quarantine: full gate control, repair the auto, empirically safe ≠ SAFE). Circuit analysis.
9. **Where things live** — path list (SPEC, cortex-persona-arc, build-stages, TESTING.md, CONTRIBUTING.md, docs/plans/).

Plus: author block, license, "not a new agent" + modern-harness copyseed (that's the operator's tone, not an item).
## Vocabulary rules (standing)

- **Banned / killed (this user, standing)**: "multi-tasking", "auto-heuristic tier", "agent layer", "story-staff", "inhibition festivity", "dispatcher tell", "attention arbitrator", "frequency lock", "recall" as a *do-THIS* sentence (only "does not recall / just busy" negatives), "Journey as concept", "Quartus", "Dispute Coordinator", "AF/LIB/state-emoji framing", all **saliency** phrasing ("scored on salience", "salience sweep" → "loop-of-thought scores them"); all "flash" / "burst" / "pick-or-shoot" words.
- **Allowed (operator-approved)**: "harness" (operator-facing prose), "curate (in arc-store)" etc. (working-model verbs), "story arc / TV notice", "tension", "episode", "dispute" (careful: not the deleted 4b), "seat", "floor" (careful — "win the floor" is the operator's own word), "identity", "associated", "trust gradient", "key pair", "pairing files". And always: plain prose in code/commits/specs (T-800 voice is chat-only).
- **Arc states never renamed**: INCUBATING / ENGAGED / INHIBITED / RESOLVED / ABSORBED. Plan maturity: UNDECOMPOSED → PLANNED → EXECUTING → RESOLVED.
- **Law 3 frame** (origination vs execution of decision policy) stays intact — Faculties do not re-derive; Reflex only re-runs.
- **Dark Lane** = model-invisible transit. Never described as "recall".**
- **BANNED repo terms**: "session", "SessionStatus", "session id", persisted `OPEN`/`ACTIVE` arc states, "persisted ENGAGED".
- **Repo rules**: master branch only, no PRs, straight commit + push; build + test gate after change (36 tests); docs/plans/* = proposal non-approval for implementation.
- **Master-copy** (final 09-12): every project CARL-02 maintains gets a GitHub master copy.


