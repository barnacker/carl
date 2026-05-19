# Minimal Viable Cortex Roadmap — Core Proposals

> **For Hermes:** This is a proposal roadmap, not an implementation plan. Do not implement any version from this document until the operator has reviewed, challenged, tuned, and explicitly approved that version's scope.

**Status:** proposal / review-required

**Goal:** Preserve a candidate sequence of Alpha MVC versions that could lead from the current fake-world Cortex harness to a stable minimal viable Cortex module.

**Critical Review Note:** These version proposals are intentionally provisional. They are expected to contain defects, missing nuances, wrong boundaries, and scope mistakes. The operator will challenge and tune them version-by-version. Treat each entry as a starting hypothesis, not accepted architecture.

**Implementation Rule:** Before implementation of any version below, create or update a dedicated reviewed implementation plan for that version. That plan must state accepted scope, rejected scope, architectural boundaries, tests, and validation gates. This roadmap alone is never sufficient authorization to implement.

---

## Current Baseline: Alpha MVC 0.01 — Fake-world Cortex Harness

**Status:** implemented on `master`.

**What exists:**
- `carltest --discord "<message>"` drives fake Discord ingress.
- Fake Discord and fake Nervous-System relay boundaries feed real Cortex.
- Real Cortex opens, activates, and resolves Arcs.
- Harness invokes a model-faculty-shaped adapter path.
- Harness-level PRIME presence and irreversible-action proposal guards exist.
- Trace utilities can replay `OPEN → ACTIVE → RESOLVED` lifecycle evidence.

**Boundary:** Cortex is real. Discord, Nervous System, model Faculty routing, output surface, and safety floor are harness simulations only.

---

## Alpha MVC 0.02 — Workspace-backed Trace Journal

**Proposal:** Make harness evidence durable across runs.

**Candidate deliverables:**
- Runtime trace journal under ignored workspace state.
- `carltest --discord "<message>"` writes JSONL trace events.
- Trace IDs and run IDs.
- Replay command such as `carltest --replay <trace-id>`.
- Tests proving persistence, replay, and no runtime-state commits.

**Candidate acceptance:**
- One CLI message persists fake Discord input, OriginStamp, Arc lifecycle, model-faculty invocation metadata, and final fake Discord output.
- Replay reconstructs `OPEN → ACTIVE → RESOLVED` from disk.

**Known review risks:**
- Journal schema may prematurely freeze the wrong trace shape.
- Disk persistence can blur fake harness state with future real Nervous-System audit state.
- Trace identity rules need operator review before becoming durable.

---

## Alpha MVC 0.03 — Cortex Session Runtime

**Proposal:** Move from one-shot harness calls to a small session loop.

**Candidate deliverables:**
- `CortexSession` or equivalent boundary owning session ID, incoming signal history, Arc history, and trace journal handle.
- `carltest --session <id> --discord "<message>"`.
- Multi-message sessions append to one session trace.
- Cortex can inspect prior Arcs in the session.

**Candidate acceptance:**
- Two messages in the same session produce two resolved Arcs.
- Trace replay can replay the whole session.
- Arc IDs remain stable and unique.
- No real Nervous System implementation is introduced.

**Known review risks:**
- Session ownership could belong outside Cortex in future real architecture.
- Session state may accidentally become memory, which it is not.
- Need to distinguish operator conversation continuity from Cortex Arc continuity.

---

## Alpha MVC 0.04 — Arc Inspection and Status Surface

**Proposal:** Make Cortex introspectable by operator tooling.

**Candidate deliverables:**
- CLI inspection commands such as `carltest --status <session-id>`, `carltest --arc <arc-id>`, and `carltest --trace <trace-id>`.
- Stable Arc read models: index, detail, lifecycle state, resolution, trace refs.
- Documentation for the read model contract.

**Candidate acceptance:**
- Operator can inspect current session, prior Arcs, trace evidence, and resolution output.
- Missing IDs, malformed trace files, and empty sessions are tested.

**Known review risks:**
- Inspection surfaces can force premature API commitments.
- Read model terms may conflict with later Nervous-System or Memory surfaces.
- Status vocabulary must remain aligned with accepted Arc states only: `OPEN`, `ACTIVE`, `DEFERRED`, `RESOLVED`, `ABSORBED`.

---

## Alpha MVC 0.05 — Focus Cycle v1

**Proposal:** Make OrientationLoop materially useful beyond direct routing.

**Candidate deliverables:**
- Explicit `FocusCycle` record with candidate Arcs, salience scores, selected Arc, selected Faculty target, and rationale/rule trace.
- Deterministic salience rules for operator recency, unresolved work, urgency/security markers, and tie behavior.
- Tests for candidate ordering, tie behavior, and explainability.

**Candidate acceptance:**
- Multiple open Arcs can exist.
- OrientationLoop selects one.
- Selection can be explained from trace data.
- Persona still does not own focus logic.

**Known review risks:**
- Competitive Inhibition / Temporal Decay nuances are underspecified here.
- A simplistic scoring rule can become architectural debt.
- Need operator review on whether salience belongs inside OrientationLoop alone or requires explicit Cortex arbitration.

---

## Alpha MVC 0.06 — Task List Inside Arc

**Proposal:** Add durable executable Tasks inside Arcs without promoting every task to a Sub-Arc.

**Candidate deliverables:**
- Task schema with status, result, and evidence refs.
- ArcStore operations for adding tasks, updating task status, and attaching evidence.
- Minimal deterministic Decomposer that can create Tasks from selected Arc intent.

**Candidate acceptance:**
- A message can create an Arc with one or more Tasks.
- Task state persists through trace/session replay.
- Sub-Arc is not used unless explicitly promoted.

**Known review risks:**
- The Arc/Task/Sub-Arc boundary is subtle and must be reviewed carefully.
- Decomposer can easily overreach into planning intelligence too early.
- Task status vocabulary must not conflict with Arc lifecycle vocabulary.

---

## Alpha MVC 0.07 — Result Buffer and Synthesis Gate v1

**Proposal:** Insert the smallest real internal workflow between model result and operator output.

**Candidate deliverables:**
- `ResultBuffer` collects model-faculty output, evidence refs, conflicts, partial results, and errors.
- `SynthesisGate` decides `READY_TO_RESPOND`, `BLOCKED`, or `NEEDS_MORE_WORK`.
- Cortex response path uses Arc, FocusDecision, buffered result, and SynthesisGate decision.

**Candidate acceptance:**
- Direct answer path still works.
- Blocked result produces a structured blocked response.
- Failed model-faculty invocation is captured as evidence.
- Ready, blocked, and faculty-error cases are tested.

**Known review risks:**
- Gate states may be wrong or insufficient.
- ResultBuffer can accidentally become a hidden memory layer.
- Blocking semantics need operator review before they shape Persona output.

---

## Alpha MVC 0.08 — Persona Policy v1

**Proposal:** Make Persona's restricted policy/output role explicit and testable.

**Candidate deliverables:**
- Persona policy surface for identity, response policy, operator-facing style constraints, and allowed output classes.
- Tests proving Persona does not own Arc lifecycle, Task lifecycle, focus selection, or trace storage.
- Policy tests for unauthorized action claims, irreversible proposals, and evidence-grounded output.

**Candidate acceptance:**
- Persona transforms SynthesisGate decisions into final operator output.
- Policy can be tested without invoking the full harness.
- Existing architecture boundary tests continue to pass.

**Known review risks:**
- Persona is already overloaded in older architecture prose; this needs careful correction.
- Policy may need to sit partly in Cortex rather than Persona.
- Output style constraints must not become behavioral authority over execution.

---

## Alpha MVC 0.09 — Model Faculty Adapter Contract

**Proposal:** Stabilize the model invocation boundary before introducing real Faculty runtime.

**Candidate deliverables:**
- `ModelFacultyAdapter` interface for prompt, origin, Arc ID, trace/run ID, response content, and structured error result.
- Fake adapter for tests.
- Hermes-compatible adapter for runtime.
- `carltest` uses adapter instead of inline fetch logic.

**Candidate acceptance:**
- Tests do not require network or API keys.
- Runtime can invoke current Hermes-compatible model config.
- Model errors are structured and replayable.
- No real Faculty bus is introduced.

**Known review risks:**
- Adapter contract may duplicate or contradict the future Synapse/Faculty contract.
- Hermes-specific config handling may leak into CARL architecture.
- Error taxonomy needs review before it becomes durable.

---

## Alpha MVC 0.10 — Minimal Viable Cortex Module

**Proposal:** Consolidate the accepted subset into a stable, documented Cortex module.

**Candidate deliverables:**
- Public Cortex runtime API, potentially including:
  - `createCortexRuntime()`
  - `receiveSignal()`
  - `getSessionStatus()`
  - `getArc()`
  - `replayTrace()`
- Stable components:
  - `Cortex`
  - `Persona`
  - `ArcStore`
  - `OrientationLoop`
  - `Decomposer`
  - `ResultBuffer`
  - `SynthesisGate`
- Stable schemas:
  - Arc
  - Task
  - OriginStamp
  - TraceEvent
  - FocusCycle
  - FacultyResult
- Cortex module README, architecture boundary doc, CLI usage doc, and trace/replay contract.

**Candidate acceptance:**
- Fresh checkout supports install, build, test, and a fake-model `carltest --discord` run.
- Session trace persists and replays.
- Multi-message session works.
- Cortex can inspect Arcs, Tasks, and status.
- FocusCycle is explicit and tested.
- Model Faculty adapter is replaceable.
- Real Nervous System, Synapse bus, Discord integration, and real Faculty runtime remain out of scope.
- Boundary tests prevent Persona/ArcStore/OrientationLoop ownership regressions.

**Known review risks:**
- The API list may be wrong.
- `CortexRuntime` may be the wrong boundary name or ownership layer.
- Minimal viability may require fewer or different components than listed here.
- The operator must decide what counts as stable enough before this version is implemented.

---

## Candidate Definition: Stable Minimal Viable Cortex

A stable minimal viable Cortex module may require the ability to:

1. Receive a typed signal.
2. Validate origin shape.
3. Open or update an Arc.
4. Select focus through an explicit OrientationLoop / arbitration mechanism.
5. Represent executable work as Tasks when needed.
6. Invoke a model-faculty-shaped adapter through a stable boundary.
7. Buffer results and errors.
8. Decide whether output is ready, blocked, or requires more work.
9. Produce Persona-policy-compliant output.
10. Persist trace evidence.
11. Replay and inspect what happened.
12. Run fully inside the fake-world harness without real Nervous-System, Discord, or Faculty infrastructure.

**Review caveat:** This definition is not final. Each item must survive operator challenge before it becomes acceptance criteria.

---

## Review Protocol Before Any Version Implementation

For each version:

1. Review this roadmap entry with the operator.
2. Identify missing nuances, boundary mistakes, and over-scope.
3. Rewrite the version into a dedicated implementation plan.
4. Add explicit negative acceptance criteria.
5. Add tests before or with implementation.
6. Validate the implementation on `master` or branch according to the operator's current instruction.
7. Update this roadmap if the accepted architecture changes.

Do not treat roadmap order as fixed. Operator review can split, reorder, merge, or discard versions.
