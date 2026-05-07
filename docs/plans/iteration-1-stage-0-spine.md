# Iteration 1 — Persona-First Stage 0 Deliverables

> **For Hermes:** Use this plan task-by-task. This iteration is intentionally smaller than the full Stage 0 spine. Do not implement reasoning escalation, Faculty dispatch, Reflex, or Memory persistence here.

**Mission:** Build the smallest runnable CARL loop: operator-like input opens an Arc, Persona answers directly, the Arc resolves, and trace evidence proves the path.

**Iteration Boundary:** Persona-first direct response only. No expensive reasoning-model escalation, no Faculty dispatch loop, no Reflex learning, no Memory persistence, no Telegram integration, no Semantic Index, no Optimization Pass, no Dark Transit implementation. Escalation from Arc to expensive reasoning model becomes a later iteration.

**Definition of Done:** A deterministic local proof-of-life run demonstrates: typed operator-like input enters the prototype, Immune/System floor validates minimum authority, Persona opens an Arc, Persona produces a direct answer without invoking the future escalation system, Arc resolves, trace replay reconstructs the Arc lifecycle, and acceptance tests pass.

---

## Tracking Legend

- [ ] Not started
- [~] In progress
- [x] Done
- [!] Blocked / requires decision

---

## Deliverable 0 — Baseline Preservation

**Status:** [x]

**Purpose:** Preserve the current clean scaffold before expanding the runtime path.

**Reviewable Output:** Existing branch remains buildable and testable before new work begins.

**Acceptance Evidence:**
- [x] `npm test` passes.
- [x] `npm run typecheck` passes.
- [x] Git worktree was clean before this plan file.

### Tasks

- [x] **Task 0.1 — Verify current tests**
  - Command: `npm test`
  - Expected: pass.

- [x] **Task 0.2 — Verify current typecheck**
  - Command: `npm run typecheck`
  - Expected: pass.

- [x] **Task 0.3 — Verify clean baseline**
  - Command: `git status --short --branch`
  - Expected before planning file: clean worktree on current branch.

---

## Deliverable 1 — Minimal Direct Persona Arc

**Status:** [ ]

**Purpose:** Prove the smallest CARL control loop before adding expensive reasoning or Faculty dispatch.

**Scope:**
- Operator-like input creates an Arc.
- Arc transitions through `OPEN → ACTIVE → RESOLVED`.
- Persona owns the direct answer path.
- Persona does not call a Reasoning Engine, Decomposer, Reflex, or Faculty in this iteration.
- Direct answer output is recorded as the Arc resolution.

**Reviewable Output:** One local test/harness call receives a direct Persona response and a resolved Arc record.

**Acceptance Evidence:**
- [ ] A direct Persona response resolves one Arc.
- [ ] Arc lifecycle uses only valid final states: `OPEN`, `ACTIVE`, `RESOLVED` for this path.
- [ ] No escalation component is required for success.
- [ ] No Faculty dispatch is required for success.

### Tasks

- [ ] **Task 1.1 — Write failing direct Persona Arc test**
  - Create: `tests/persona/direct-persona-arc.test.js`
  - Test imports from: `../../dist/cortex/persona/index.js`
  - Assert: direct handler returns `{ arc_state: 'RESOLVED', response: ... }`.
  - Assert: trace contains `ARC_OPEN`, `ARC_ACTIVE`, `ARC_RESOLVED`.
  - Command: `npm test`
  - Expected before implementation: fail because handler/export does not exist.

- [ ] **Task 1.2 — Add direct Persona Arc types**
  - Modify: `schemas/arc.ts`
  - Add minimal `ArcRecord`, `ArcBudget`, and transition helper signatures if needed.
  - Modify: `schemas/index.ts`
  - Export new types/helpers.
  - Command: `npm run typecheck`
  - Expected: pass after implementation.

- [ ] **Task 1.3 — Implement direct Persona handler**
  - Modify: `cortex/persona/index.ts`
  - Optional create: `cortex/persona/direct-persona.ts`
  - Function shape: accepts typed operator input + dependencies, creates Arc, emits lifecycle trace events, returns direct response resolution.
  - Constraint: must not import `reasoning-engine`, `decomposer`, `result-buffer`, `synthesis-gate`, `faculties`, or `nervous-system` internals.
  - Command: `npm test -- tests/persona/direct-persona-arc.test.js`
  - Expected: direct Persona test passes.

- [ ] **Task 1.4 — Add regression check for no escalation path**
  - Modify: `tests/persona/direct-persona-arc.test.js`
  - Assert no dependency function named `escalate`, `dispatchFaculty`, or `invokeReasoningEngine` is required or called.
  - Command: `npm test`
  - Expected: pass.

---

## Deliverable 2 — Minimal Runtime Contract Surface

**Status:** [ ]

**Purpose:** Define only the typed data contracts needed for the direct Persona path.

**Scope:**
- Operator input envelope.
- Origin stamp shape/check.
- Arc record shape.
- Direct Persona response shape.
- Trace event shape for open/active/response/resolved.

**Reviewable Output:** Schema files and tests prove the direct path uses plain serializable typed objects.

**Acceptance Evidence:**
- [ ] Invalid operator input envelope is rejected.
- [ ] Missing/invalid origin is rejected.
- [ ] Direct response has a typed resolution payload.
- [ ] Trace event schema excludes raw opaque payload fields unless explicitly elevated by the test fixture.

### Tasks

- [ ] **Task 2.1 — Write failing schema contract tests**
  - Create: `tests/schemas/direct-persona-contract.test.js`
  - Assert valid operator input envelope is accepted.
  - Assert missing `origin` is rejected.
  - Assert direct response schema requires `arc_id`, `arc_state`, and `response_text`.
  - Assert trace event with raw `payload` field is rejected or not representable.
  - Command: `npm test`
  - Expected before implementation: fail.

- [ ] **Task 2.2 — Add operator input and direct response schemas**
  - Create: `schemas/operator-input.ts`
  - Create: `schemas/direct-response.ts`
  - Modify: `schemas/index.ts`
  - Keep schemas plain TypeScript + pure validation helpers; do not add a runtime schema dependency unless explicitly approved.
  - Command: `npm run typecheck`
  - Expected: pass.

- [ ] **Task 2.3 — Add origin validation helper**
  - Modify: `schemas/origin-stamp.ts`
  - Add `isOriginStamp(value: unknown): value is OriginStamp` or equivalent pure helper.
  - Reject unauthenticated/malformed origin stamps.
  - Command: `npm test -- tests/schemas/direct-persona-contract.test.js`
  - Expected: pass.

- [ ] **Task 2.4 — Tighten trace event helper for direct path**
  - Modify: `schemas/trace-event.ts`
  - Add helper for direct-path trace creation or validation.
  - Ensure trace carries `schema_hash`, `arc_id`, `origin_hash`, `arc_state`; no raw operator prompt/body field.
  - Command: `npm test`
  - Expected: pass.

---

## Deliverable 3 — Minimal Nervous System Ingress/Egress

**Status:** [ ]

**Purpose:** Route the direct path through the architecture boundary without building the full bus/faculty system yet.

**Scope:**
- Test-harness or CLI-like ingress adapter.
- Minimal Synapse-compatible publish path for operator input.
- Minimal output emission path for Persona response.
- In-memory trace collector for deterministic tests.
- Full Faculty-facing bus hardening deferred.

**Reviewable Output:** Input and output cross a named boundary instead of calling Persona internals directly from tests.

**Acceptance Evidence:**
- [ ] Tests enter through the boundary adapter.
- [ ] Persona response exits through the boundary adapter.
- [ ] Trace events are emitted for each lifecycle hop.
- [ ] No direct Faculty bus access claim is expanded beyond what this iteration implements.

### Tasks

- [ ] **Task 3.1 — Write failing boundary harness test**
  - Create: `tests/nervous-system/direct-persona-boundary.test.js`
  - Test imports from: `../../dist/nervous-system/index.js`
  - Test calls a named boundary function, not Persona internals.
  - Assert response resolves and trace is available.
  - Command: `npm test`
  - Expected before implementation: fail.

- [ ] **Task 3.2 — Implement in-memory trace collector**
  - Create: `nervous-system/trace/in-memory-trace.ts`
  - Modify: `nervous-system/trace/index.ts`
  - Collector API: append trace event, list events, clear/reset for tests.
  - Command: `npm run typecheck`
  - Expected: pass.

- [ ] **Task 3.3 — Implement direct Persona boundary adapter**
  - Create: `nervous-system/direct-persona-boundary.ts`
  - Modify: `nervous-system/index.ts`
  - Adapter validates input, invokes direct Persona handler, returns response + trace reference.
  - Constraint: this is not a full bus implementation.
  - Command: `npm test -- tests/nervous-system/direct-persona-boundary.test.js`
  - Expected: pass.

- [ ] **Task 3.4 — Preserve Synapse compatibility naming**
  - Modify: `synapse/contract/synapse.interface.ts` only if the direct path needs a narrow contract extension.
  - Prefer adapter-level code over expanding Synapse prematurely.
  - Command: `npm run typecheck`
  - Expected: pass.

---

## Deliverable 4 — Minimum Immune/System Floor

**Status:** [ ]

**Purpose:** Keep the direct Persona path honest without overbuilding Stage 0 enforcement.

**Scope:**
- Origin presence validation.
- PRIME template presence check.
- Irreversible-action guard placeholder: direct Persona path may answer, but must not execute irreversible actions.
- Capability registry remains present but is not expanded into full dispatch enforcement until Faculty dispatch iteration.

**Reviewable Output:** The prototype refuses malformed authority and cannot accidentally perform execution-side effects.

**Acceptance Evidence:**
- [ ] Missing origin rejects the Arc open request.
- [ ] Missing `PRIME.md`/template equivalent fails boot or harness setup.
- [ ] Direct Persona path has no execution side-effect API.
- [ ] Attempted irreversible execution request is represented as non-executed text/proposal only.

### Tasks

- [ ] **Task 4.1 — Write failing Immune floor tests**
  - Create: `tests/immune-system/direct-persona-floor.test.js`
  - Assert missing origin rejects request.
  - Assert malformed origin rejects request.
  - Assert missing `workspace-template/PRIME.md` check fails when path override points to absent file.
  - Assert direct path exposes no execution API.
  - Command: `npm test`
  - Expected before implementation: fail.

- [ ] **Task 4.2 — Add boot/PRIME presence helper**
  - Create: `nervous-system/immune-system/prime-check.ts`
  - Modify: `nervous-system/immune-system/index.ts`
  - Helper accepts explicit path for tests; default may point to `workspace-template/PRIME.md` until runtime workspace bootstrap exists.
  - Command: `npm test -- tests/immune-system/direct-persona-floor.test.js`
  - Expected: PRIME checks pass.

- [ ] **Task 4.3 — Integrate origin validation into boundary adapter**
  - Modify: `nervous-system/direct-persona-boundary.ts`
  - Use `isOriginStamp` before opening Arc.
  - Rejection should return typed error or throw documented error; tests must pin chosen behavior.
  - Command: `npm test`
  - Expected: origin rejection tests pass.

- [ ] **Task 4.4 — Add irreversible-action non-execution guard**
  - Modify: `schemas/operator-input.ts`
  - Modify: `cortex/persona/direct-persona.ts` or `cortex/persona/index.ts`
  - Minimal rule: if input marks/contains declared irreversible execution intent, direct path returns non-executed proposal text and never performs side effect.
  - Command: `npm test`
  - Expected: irreversible guard test passes.

---

## Deliverable 5 — Acceptance Harness Expansion

**Status:** [ ]

**Purpose:** Convert this smaller iteration into executable checks.

**Scope:**
- End-to-end direct Persona response test.
- Arc lifecycle test for `OPEN → ACTIVE → RESOLVED`.
- Origin rejection test.
- PRIME presence test.
- Trace replay reconstruction test for the direct path.
- Regression test that no escalation/Faculty dispatch is required in Iteration 1.

**Reviewable Output:** `npm test` proves the Persona-first loop without relying on future components.

**Acceptance Evidence:**
- [ ] E2E direct Persona path passes locally.
- [ ] Trace replay reconstructs completed direct-response Arc from trace events alone.
- [ ] Missing origin test fails closed.
- [ ] Missing PRIME test fails closed.
- [ ] Test suite proves no expensive reasoning escalation is invoked.

### Tasks

- [ ] **Task 5.1 — Add trace replay helper test**
  - Create: `tests/replay/direct-persona-trace-replay.test.js`
  - Assert trace event list reconstructs one Arc id, origin hash, and terminal `RESOLVED` state.
  - Command: `npm test`
  - Expected before replay helper: fail.

- [ ] **Task 5.2 — Implement trace replay helper**
  - Create: `nervous-system/trace/replay.ts`
  - Modify: `nervous-system/trace/index.ts`
  - Helper reconstructs direct-path Arc lifecycle from trace events only.
  - Command: `npm test -- tests/replay/direct-persona-trace-replay.test.js`
  - Expected: pass.

- [ ] **Task 5.3 — Add full direct-path E2E test**
  - Create: `tests/e2e/direct-persona-proof-of-life.test.js`
  - Test path: boundary adapter → Persona direct handler → trace collector → replay helper.
  - Assert no Faculty/Reasoning imports or mocked escalation functions are needed.
  - Command: `npm test`
  - Expected: pass.

- [ ] **Task 5.4 — Run full validation gate**
  - Commands:
    - `npm run build`
    - `npm run typecheck`
    - `npm test`
    - `git status --short`
  - Expected: build/typecheck/tests pass; git status contains intentional changed/created files only.

---

## Deliverable 6 — Escalation Backlog Boundary

**Status:** [ ]

**Purpose:** Preserve the future architecture without building it prematurely.

**Scope:**
- Document that expensive reasoning invocation is a later Arc escalation system.
- Define the conceptual escalation trigger boundary at high level only.
- Explicitly defer Reasoning Engine, Decomposer, Result Buffer, Synthesis Gate, Faculty dispatch, Reflex, and Memory persistence to later deliverables.

**Reviewable Output:** A short backlog section prevents Iteration 1 from accidentally expanding into the full Stage 0 spine.

**Acceptance Evidence:**
- [ ] Plan names the deferred escalation system.
- [ ] Plan lists components intentionally excluded from Iteration 1.
- [ ] Groomed tasks do not implement deferred components.

### Tasks

- [ ] **Task 6.1 — Add deferred escalation note**
  - Modify: this file, section `Deferred Escalation Backlog` below.
  - Keep it high-level; do not specify implementation tasks for escalation yet.

- [ ] **Task 6.2 — Review implementation tasks for scope creep**
  - Check all tasks above.
  - Confirm none implement Reasoning Engine escalation, Faculty dispatch, Reflex, Memory persistence, Telegram, Semantic Index, Optimization Pass, or Dark Transit.

---

## Deferred Escalation Backlog

Future iteration target: Arc-owned escalation system that invokes an expensive reasoning model only when Persona direct answering is insufficient.

Deferred components:
- Reasoning Engine invocation policy.
- Escalation trigger classification.
- Decomposer.
- Result Buffer.
- Synthesis Gate beyond direct-response trace replay.
- Faculty dispatch path.
- Reflex miss/hit path.
- Memory Faculty persistence.
- External sensory ingress such as Telegram.

---

## Review Notes From Operator

- Persona should answer directly first.
- Expensive reasoning-model escalation should be created later and invoked from the Arc only when needed.
- First deliverable set should be smaller than full Stage 0 spine proof-of-life.

---

## Final Validation Commands

Run before declaring Iteration 1 terminated:

```bash
npm run build
npm run typecheck
npm test
git status --short
```
