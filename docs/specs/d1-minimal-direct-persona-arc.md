# D1 Specification — Minimal Direct Persona Arc

## Status

Proposed for operator review. Do not implement until approved.

## Source

- Board card: `t_517af778` — D1 — Minimal direct Persona Arc
- Source plan: `docs/plans/iteration-1-stage-0-spine.md`
- Iteration boundary: Persona-first direct response only.

## Mission

Prove the smallest CARL control loop before adding expensive reasoning, decomposition, Faculty dispatch, Reflex, Memory persistence, Telegram integration, Semantic Index, Optimization Pass, or Dark Transit.

A single operator-like input must:

1. create an Arc,
2. transition that Arc through `OPEN → ACTIVE → RESOLVED`,
3. produce a direct Persona-owned response,
4. record that direct response as the Arc resolution,
5. emit deterministic trace evidence for the lifecycle.

## Non-goals

D1 must not implement or require:

- Reasoning Engine escalation
- Decomposer invocation
- Faculty dispatch
- Reflex learning
- Memory persistence
- Nervous System ingress/egress adapter
- full Synapse bus behavior
- async/background execution
- model-provider calls
- network calls

Those belong to later deliverables/iterations.

## Files To Create Or Modify

### Create

- `tests/persona/direct-persona-arc.test.js`

### Modify

- `schemas/arc.ts`
- `schemas/index.ts`
- `cortex/persona/index.ts`

### Optional Create

- `cortex/persona/direct-persona.ts`

The optional file is allowed only if it keeps `cortex/persona/index.ts` small and preserves the same public export surface.

## Public API Shape

The Persona package should export one direct-path handler. Proposed name:

```ts
handleDirectPersonaArc(input, dependencies)
```

Required return shape:

```ts
{
  arc_id: string;
  arc_state: 'RESOLVED';
  response: string;
  trace: Array<{
    event_type: 'ARC_OPEN' | 'ARC_ACTIVE' | 'ARC_RESOLVED';
    arc_id: string;
    arc_state: 'OPEN' | 'ACTIVE' | 'RESOLVED';
  }>;
}
```

The existing plan says the test should assert `{ arc_state: 'RESOLVED', response: ... }`. The richer shape above keeps those fields and adds stable `arc_id` and trace evidence.

## Input Contract

D1 may use a minimal typed operator-like input object. Proposed shape:

```ts
{
  text: string;
  origin?: {
    kind: 'operator' | string;
    id?: string;
  };
}
```

D1 should not harden origin validation beyond what the direct Persona Arc needs. Stronger operator input/origin validation is D2.

## Dependency Injection Surface

The handler should accept deterministic dependencies instead of calling global services.

Proposed dependency shape:

```ts
{
  createArcId?: () => string;
  createResponse?: (inputText: string) => string;
  emitTrace?: (event: DirectPersonaArcTraceEvent) => void;
}
```

Default behavior may be pure and local:

- `createArcId`: deterministic enough for tests if injected
- `createResponse`: returns a direct Persona response derived from input text
- `emitTrace`: no-op unless provided

## Arc Types

Add or refine minimal direct-path types in `schemas/arc.ts`:

```ts
export type ArcState = 'OPEN' | 'ACTIVE' | 'DEFERRED' | 'RESOLVED' | 'ABSORBED';

export interface ArcRecord {
  id: string;
  state: ArcState;
  objective: string;
  resolution?: string;
}

export interface ArcBudget {
  max_steps: number;
}
```

D1 direct path uses only:

```text
OPEN → ACTIVE → RESOLVED
```

Existing canonical Arc states must remain aligned with project memory:

```text
OPEN, ACTIVE, DEFERRED, RESOLVED, ABSORBED
```

## Transition Rules

For D1, the handler should perform exactly this lifecycle:

1. Create Arc in `OPEN`
2. Emit `ARC_OPEN`
3. Transition Arc to `ACTIVE`
4. Emit `ARC_ACTIVE`
5. Produce direct Persona response
6. Transition Arc to `RESOLVED`
7. Attach response as resolution
8. Emit `ARC_RESOLVED`
9. Return resolved response object

Invalid transitions are not the focus of D1 unless already covered by existing schema tests.

## Trace Contract

D1 test must assert trace event order includes:

```text
ARC_OPEN
ARC_ACTIVE
ARC_RESOLVED
```

Minimum event shape:

```ts
{
  event_type: 'ARC_OPEN' | 'ARC_ACTIVE' | 'ARC_RESOLVED';
  arc_id: string;
  arc_state: 'OPEN' | 'ACTIVE' | 'RESOLVED';
}
```

D1 should not introduce raw opaque prompt/body payload fields into trace events. Stronger trace schema hardening is D2.

## Forbidden Imports

D1 Persona implementation must not import from:

- `reasoning-engine`
- `decomposer`
- `result-buffer`
- `synthesis-gate`
- `faculties`
- `nervous-system` internals

The direct Persona path must be locally testable without escalation or dispatch infrastructure.

## Regression Guard

The D1 test should assert no dependency function with these names is required or called:

- `escalate`
- `dispatchFaculty`
- `invokeReasoningEngine`

Preferred test pattern:

```js
const forbidden = {
  escalate: () => { throw new Error('forbidden'); },
  dispatchFaculty: () => { throw new Error('forbidden'); },
  invokeReasoningEngine: () => { throw new Error('forbidden'); },
};
```

Pass those into the dependency object if the implementation accepts arbitrary dependency keys. The test passes only if none are used.

## Test Plan

### Step 1 — Red test

Create `tests/persona/direct-persona-arc.test.js` importing from built output:

```js
import { handleDirectPersonaArc } from '../../dist/cortex/persona/index.js';
```

Run:

```bash
npm test
```

Expected before implementation:

```text
fail: handler/export does not exist
```

### Step 2 — Type implementation

Modify `schemas/arc.ts` and `schemas/index.ts`.

Run:

```bash
npm run typecheck
```

Expected:

```text
pass
```

### Step 3 — Persona implementation

Modify `cortex/persona/index.ts`; optionally create `cortex/persona/direct-persona.ts`.

Run:

```bash
npm test -- tests/persona/direct-persona-arc.test.js
```

Expected:

```text
pass
```

### Step 4 — Full regression

Run:

```bash
npm test
npm run typecheck
```

Expected:

```text
pass
pass
```

## Acceptance Criteria

D1 is done only when:

- direct Persona response resolves one Arc
- returned object includes `arc_state: 'RESOLVED'`
- returned object includes non-empty `response`
- trace contains ordered lifecycle events: `ARC_OPEN`, `ARC_ACTIVE`, `ARC_RESOLVED`
- no Reasoning Engine escalation is required
- no Decomposer is required
- no Faculty dispatch is required
- no Nervous System internals are imported
- `npm test` passes
- `npm run typecheck` passes

## Post-approval Execution Plan

After operator approval:

1. mark D1 spec approved in the working notes or PR discussion,
2. implement Task 1.1 red test,
3. implement Task 1.2 Arc types/helpers,
4. implement Task 1.3 direct Persona handler,
5. implement Task 1.4 no-escalation regression,
6. run validation commands,
7. update `docs/plans/iteration-1-stage-0-spine.md` D1 checklist,
8. complete Kanban card `t_517af778` with test evidence.

## Rollback And Recovery

If implementation fails after approval:

- keep the spec unchanged,
- revert only implementation/test changes from the implementation branch,
- preserve failure logs,
- report raw error, likely cause, and one recovery path before continuing.

If this spec is rejected:

- do not implement D1,
- revise this file in a new commit or replace the PR with an updated spec branch.
