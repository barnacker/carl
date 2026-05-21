# Alpha MVC 0.05 — Focus Cycle v1 Implementation Plan

> Status: reviewed scope / implementation-authorized by operator before code only after this plan is accepted.

## Goal

Make `OrientationLoop` materially useful by producing an explicit, deterministic, explainable `FocusCycle` for selecting one Arc from multiple candidate Arcs.

Alpha MVC 0.05 must introduce selection evidence without introducing Tasks, Sub-Arcs, Memory, real Nervous System, real Synapse, real Faculty bus, or Discord runtime.

## Architecture

Cortex remains the top-level boundary. ArcStore owns Arc lifecycle and inspection. OrientationLoop owns salience scoring, candidate ordering, and FocusDecision creation. Cortex invokes OrientationLoop and records/returns the resulting FocusCycle evidence; Persona does not own focus logic.

0.05 is deterministic and local. It is not the final Competitive Inhibition implementation. It is a testable first slice that models inhibition as ranked salience terms and leaves full Temporal Decay/recovery semantics for later review.

## Tech Stack

TypeScript, Node test runner, existing `carltest` fake-world harness, JSONL trace utilities, ignored `runtime/` state.

---

## Reviewed Decisions

- Use `FocusCycle`, `FocusCandidate`, `SalienceScore`, and `FocusDecision` as final domain names.
- Keep salience inside `OrientationLoop`; Cortex orchestrates but does not duplicate scoring rules.
- Represent Competitive Inhibition v1 as deterministic candidate scoring plus selected/winner evidence.
- Include Temporal Decay placeholders/terms only as explicit, deterministic scoring inputs; do not implement autonomous absorption or time-based background decay in 0.05.
- Multiple open Arcs can exist inside ArcStore for scoring tests, but the normal `carltest --discord` one-message path may still resolve its Arc in the same run.
- Do not introduce Tasks, Sub-Arcs, Decomposer behavior, ResultBuffer, SynthesisGate, Memory, Association Faculty, real Nervous System, real Synapse, real Faculty bus, or real Discord.

## Scope

### In scope

- Add explicit `FocusCycle` and `FocusCandidate` read-model/schema types.
- Extend `SalienceScore` into an explainable term-based score.
- Add deterministic OrientationLoop scoring rules for:
  - unresolved lifecycle state;
  - operator recency;
  - urgency/security markers;
  - deferred penalty;
  - deterministic tie behavior.
- Add OrientationLoop API for scoring a candidate set and selecting one FocusDecision.
- Add tests proving multiple Arcs can be open and OrientationLoop selects one.
- Add tests proving tie behavior is deterministic and explainable.
- Add trace/read-model evidence for the FocusCycle in harness output and/or debug trace.
- Add docs for FocusCycle v1 command behavior and limitations.

### Out of scope

- Tasks.
- Sub-Arcs.
- Decomposer behavior.
- ResultBuffer.
- SynthesisGate.
- Memory Faculty.
- Association Faculty.
- Embeddings or semantic clustering.
- Real Temporal Decay background loop.
- Autonomous `ABSORBED` transition.
- Real Nervous System bus.
- Real Synapse runtime.
- Real Faculty dispatch infrastructure.
- Real Discord integration.
- Generic chat sessions.

## Data Model Direction

### `SalienceScore`

```ts
interface SalienceScore {
  readonly total: number
  readonly terms: readonly SalienceTerm[]
}

interface SalienceTerm {
  readonly name:
    | 'STATE_OPEN'
    | 'STATE_ACTIVE'
    | 'STATE_DEFERRED'
    | 'OPERATOR_RECENCY'
    | 'URGENCY_MARKER'
    | 'SECURITY_MARKER'
    | 'TIE_BREAKER'
  readonly value: number
  readonly reason: string
}
```

Rules are additive and deterministic. Term names are intentionally narrow; do not add broad ML-like confidence fields in 0.05.

### `FocusCandidate`

```ts
interface FocusCandidate {
  readonly arc_id: string
  readonly title: string
  readonly state: ArcState
  readonly created_at: number
  readonly activated_at?: number
  readonly resolved_at?: number
  readonly salience: SalienceScore
}
```

### `FocusDecision`

```ts
interface FocusDecision {
  readonly selected_arc_id: string
  readonly selected_title: string
  readonly selected_state: ArcState
  readonly faculty_id: 'persona-direct'
  readonly faculty_role: 'MODEL_FACULTY'
  readonly reason: string
  readonly salience: SalienceScore
}
```

0.05 keeps the selected faculty target as the existing direct/persona model-faculty-shaped path. Do not introduce real Faculty routing.

### `FocusCycle`

```ts
interface FocusCycle {
  readonly cycle_id: string
  readonly created_at: number
  readonly candidates: readonly FocusCandidate[]
  readonly decision: FocusDecision
  readonly ruleset: 'alpha-mvc-focus-cycle/v1'
}
```

`cycle_id` may be deterministic in tests. If no explicit ID is supplied, derive from run/trace context or timestamp using existing project ID patterns.

## Salience Rules v1

Use simple deterministic weights. These weights are reviewable and not final cognitive architecture:

1. `STATE_ACTIVE`: `+100`
   - Active work remains highly salient unless a stronger urgent/security marker appears.
2. `STATE_OPEN`: `+80`
   - Open unresolved work is eligible for focus.
3. `STATE_DEFERRED`: `+20`
   - Deferred work remains auditable but suppressed.
4. `OPERATOR_RECENCY`: latest operator-created unresolved Arc gets `+30`; next gets `+20`; next gets `+10`; older gets `+0`.
5. `URGENCY_MARKER`: message/title contains urgent terms such as `urgent`, `asap`, `now`, `emergency`, `blocked`: `+40`.
6. `SECURITY_MARKER`: message/title contains `security`, `privacy`, `token`, `credential`, `leak`, `breach`: `+50`.
7. `TIE_BREAKER`: if total scores match, choose the newest `created_at`; if still tied, lexicographically smallest Arc ID. Represent tie handling in `reason`, not as a hidden mutation.

Do not implement autonomous decay over wall time in 0.05. If an `age` term is needed later, make it a reviewed 0.06+ decision or split into a separate version.

## Command / Output Direction

The normal one-message harness should remain compatible:

```bash
carltest --discord "Hey how are you?"
```

Debug output may include FocusCycle evidence:

```json
{
  "focus_cycle": {
    "cycle_id": "focus-...",
    "ruleset": "alpha-mvc-focus-cycle/v1",
    "candidates": [
      {
        "arc_id": "arc-...",
        "title": "Urgent security review",
        "state": "OPEN",
        "salience": {
          "total": 200,
          "terms": []
        }
      }
    ],
    "decision": {
      "selected_arc_id": "arc-...",
      "selected_title": "Urgent security review",
      "faculty_id": "persona-direct",
      "faculty_role": "MODEL_FACULTY",
      "reason": "Selected highest salience candidate using alpha-mvc-focus-cycle/v1."
    }
  }
}
```

Normal operator-facing output should not expose raw Arc IDs. If normal output includes focus information, use title/handle only. Debug trace may expose raw Arc IDs.

## Negative Acceptance Criteria

The implementation is invalid if it:

- puts salience scoring or FocusDecision creation in `cortex/persona.ts`;
- moves Arc lifecycle ownership out of ArcStore;
- introduces `session`, `SessionStatus`, or `session_id` runtime concepts;
- introduces Tasks, Sub-Arcs, Decomposer execution, ResultBuffer, or SynthesisGate;
- implements Memory, Association Faculty, embeddings, semantic clustering, real Nervous System, real Synapse, real Faculty bus, or real Discord;
- adds Arc states outside `OPEN`, `ACTIVE`, `DEFERRED`, `RESOLVED`, `ABSORBED`;
- performs autonomous `ABSORBED` transitions or background Temporal Decay;
- hides tie behavior or salience terms from debug/explainability output.

## Task 1: Add FocusCycle boundary tests

**Objective:** Define expected OrientationLoop ownership and FocusCycle shape before implementation.

**Files:**
- Modify: `tests/cortex/cortex-arc.test.js`
- Modify: `cortex/orientation-loop.ts`

**Step 1: Write failing test**

Add a test that imports OrientationLoop and expects it to expose `createFocusCycle()` or equivalent final API returning:

- `ruleset: 'alpha-mvc-focus-cycle/v1'`
- `candidates`
- `decision`
- term-based `salience`

Also add a static boundary assertion that `cortex/persona.ts` does not contain `FocusCycle`, `FocusDecision`, `SalienceScore`, or scoring terms.

**Step 2: Run test to verify failure**

```bash
npm run build && node --test tests/cortex/cortex-arc.test.js
```

Expected: FAIL because FocusCycle API/schema is absent or incomplete.

## Task 2: Implement term-based salience types

**Objective:** Add final-domain FocusCycle/Salience types in OrientationLoop without changing harness behavior.

**Files:**
- Modify: `cortex/orientation-loop.ts`

**Implementation direction:**

- Export `SalienceTerm`, `SalienceScore`, `FocusCandidate`, `FocusDecision`, `FocusCycle`.
- Keep existing `OrientationLoop` API compatible.
- Use final vocabulary only; no `prototype` or `minimal` public names.

**Verification:**

```bash
npm run build && node --test tests/cortex/cortex-arc.test.js
```

Expected: PASS for new type/shape tests or progress to scoring failures.

## Task 3: Add deterministic candidate scoring tests

**Objective:** Prove salience scoring orders unresolved Arcs deterministically.

**Files:**
- Modify: `tests/cortex/cortex-arc.test.js`

**Test cases:**

- urgent/security Arc beats ordinary open Arc.
- active Arc beats ordinary open Arc unless security/urgency weight exceeds it according to reviewed weights.
- deferred Arc is eligible but penalized.
- term list explains total score.

**Verification:**

```bash
npm run build && node --test tests/cortex/cortex-arc.test.js
```

Expected: FAIL before implementation, PASS after Task 4.

## Task 4: Implement deterministic salience scoring

**Objective:** Make OrientationLoop score candidates using reviewed additive terms.

**Files:**
- Modify: `cortex/orientation-loop.ts`

**Implementation direction:**

- Add pure function or OrientationLoop method for scoring Arc-like candidates.
- Add state, recency, urgency, security, and deferred terms.
- Keep tie handling explicit and deterministic.
- Do not mutate Arc state during scoring.

**Verification:**

```bash
npm run build && node --test tests/cortex/cortex-arc.test.js
```

Expected: PASS for scoring tests.

## Task 5: Add FocusCycle selection tests

**Objective:** Prove OrientationLoop creates a full FocusCycle and selects the highest-salience candidate.

**Files:**
- Modify: `tests/cortex/cortex-arc.test.js`

**Test cases:**

- Multiple open Arcs can exist in ArcStore.
- OrientationLoop selects one Arc.
- `FocusDecision.reason` names the ruleset and winner basis.
- deterministic ties choose newest `created_at`, then lexicographic Arc ID.
- Persona still does not own focus logic.

**Verification:**

```bash
npm run build && node --test tests/cortex/cortex-arc.test.js
```

Expected: FAIL before implementation, PASS after Task 6.

## Task 6: Implement FocusCycle creation

**Objective:** Add OrientationLoop method that returns a full FocusCycle from candidate Arcs.

**Files:**
- Modify: `cortex/orientation-loop.ts`
- Modify: `cortex/index.ts` only if Cortex needs orchestration accessors/wiring.

**Implementation direction:**

- Create candidates from Arc records.
- Score each candidate.
- Sort by total score, then newest `created_at`, then lexicographic Arc ID.
- Create decision using selected candidate.
- Return full FocusCycle.
- Keep function pure relative to ArcStore; no lifecycle mutation inside scoring/selection.

**Verification:**

```bash
npm run build && node --test tests/cortex/cortex-arc.test.js
```

Expected: PASS.

## Task 7: Add harness/debug trace FocusCycle evidence tests

**Objective:** Surface FocusCycle evidence through the Alpha MVC harness without exposing raw IDs in normal output.

**Files:**
- Modify: `tests/harness/alpha-mvc-harness.test.js`
- Modify: `tests/harness/alpha-mvc-journal.test.js` if persisted trace evidence changes.

**Test cases:**

- Debug harness result includes `focus_cycle` with ruleset, candidates, and decision.
- Normal CLI output does not expose raw Arc IDs through focus data.
- Debug CLI output may expose raw FocusCycle candidate Arc IDs.
- Existing 0.04 inspection commands still pass.

**Verification:**

```bash
npm run build && node --test tests/harness/alpha-mvc-harness.test.js tests/harness/alpha-mvc-journal.test.js
```

Expected: FAIL before implementation, PASS after Task 8.

## Task 8: Wire FocusCycle evidence into Cortex/harness

**Objective:** Attach FocusCycle evidence to the fake-world run path while preserving existing CLI compatibility.

**Files:**
- Modify: `cortex/index.ts`
- Modify: `harness/alpha-mvc.ts`
- Modify: `bin/carltest.js` only if CLI debug output needs to expose the field.
- Modify: `harness/alpha-mvc-journal.ts` only if trace journal records FocusCycle evidence.

**Implementation direction:**

- Let Cortex ask OrientationLoop for FocusCycle before direct Persona/model path.
- Preserve current `--discord` output shape unless debug trace is requested.
- If journal events include FocusCycle, keep normal journal compact and debug-only details expanded.
- Do not introduce real Faculty routing; selected faculty stays the current model-faculty-shaped direct path.

**Verification:**

```bash
npm run build && node --test tests/harness/alpha-mvc-harness.test.js tests/harness/alpha-mvc-journal.test.js
```

Expected: PASS.

## Task 9: Update runtime docs

**Objective:** Document Alpha MVC 0.05 behavior, limitations, and command examples.

**Files:**
- Create: `docs/alpha-mvc-0.05-focus-cycle.md`
- Modify: `README.md`
- Modify: `docs/plans/minimal-viable-cortex-roadmap.md`
- Modify: `docs/cortex-persona-arc.md` if implementation changes FocusCycle shape.

**Verification:**

```bash
git diff --check
```

Expected: PASS.

## Task 10: Full validation and smoke

**Objective:** Prove the implementation is buildable, tested, and compatible with 0.04 commands.

**Commands:**

```bash
npm run build
npm run typecheck
npm test
git diff --check
```

0.05 smoke:

```bash
CARLTEST_FAKE_MODEL_RESPONSE='CLI fake model result' \
CARLTEST_TRACE_ID='trace-0-05-smoke' \
CARLTEST_RUN_ID='run-0-05-smoke' \
node bin/carltest.js --discord 'Urgent security focus cycle check' --debug-trace
node bin/carltest.js --status
node bin/carltest.js --arc 1 --debug-trace
node bin/carltest.js --trace trace-0-05-smoke --debug-trace
```

Expected:

- Build/typecheck/tests pass.
- Debug output includes FocusCycle evidence.
- Normal operator-facing output does not expose raw Arc IDs through FocusCycle data.
- Existing 0.04 inspection commands still work.

## Acceptance Criteria

Alpha MVC 0.05 is accepted when:

- `OrientationLoop` exports explicit FocusCycle/FocusCandidate/FocusDecision/SalienceScore types.
- Multiple candidate Arcs can be scored.
- OrientationLoop selects one candidate deterministically.
- Selection is explainable through salience terms and decision reason.
- Tie behavior is tested and deterministic.
- Persona does not own focus logic.
- ArcStore remains lifecycle owner.
- Debug harness/trace output can expose FocusCycle evidence.
- Normal operator-facing output does not expose raw Arc IDs.
- Existing 0.04 `--status`, `--arc`, `--trace`, `--recent`, and `--replay-recent` behavior remains compatible.
- Runtime files remain ignored.
- No Tasks, Sub-Arcs, Memory, Association Faculty, real Nervous System, Synapse, Faculty bus, Discord runtime, generic sessions, autonomous absorption, or background Temporal Decay are introduced.
