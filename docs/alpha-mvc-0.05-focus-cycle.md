# Alpha MVC 0.05 — FocusCycle and Derived Arc Presentation

## Status

Current Alpha MVC 0.05 runtime documentation.

## Scope

0.05 makes `OrientationLoop` produce deterministic, explainable FocusCycle evidence for selecting one Arc from candidate Arcs.

It does not introduce Tasks, Sub-Arcs, Memory, Association Faculty, real Nervous System, real Synapse, real Faculty bus, Discord runtime, autonomous absorption, background Temporal Decay, or a persisted `ENGAGED` state.

## State model

CARL stores facts, events, and durable commitments. CARL derives operational states, modes, and orientation from those facts at query time.

ArcState is a read-model projection derived from stored facts and the current tick:

```ts
if (arc.resolved_at) return "RESOLVED";
if (arc.absorbed_into_arc_id) return "ABSORBED";
if (currentTick?.engaged_arc_id === arc.id) return "ENGAGED";
if (arc.activated_at === undefined) return "INCUBATING";
return "INHIBITED";
```

`ENGAGED` is ephemeral and derived from the current FocusCycle / future OrientationTick. `INCUBATING` projects when the Arc never entered the loop (`activated_at` absent): fresh, stored, or being designed. `INHIBITED` projects for alive in-the-loop Arcs the current tick does not engage. Specific conditions such as blocked, pending Faculty, operator-input-required, priority-gap, suppressed, or resource-gap remain derived from stored facts/events/reasons; none of them apply to `INCUBATING`.

## Current bridge vocabulary

0.05 keeps current implementation bridge names:

- `FocusCycle` — current bounded selection/evidence cycle; future taxonomy: `OrientationTick`.
- `FocusCandidate` — candidate Arc read model; future taxonomy: `OrientationCandidate`.
- `FocusDecision` — selected Arc/faculty decision; future taxonomy: `OrientationDecision`.
- `SalienceScore` — implementation-level score corresponding to effective signal strength.

Do not rename these APIs to OrientationTick taxonomy until explicitly scoped.

## Runtime path

```text
validated signal
-> Cortex opens Arc in ArcStore
-> ArcStore records Arc facts/events
-> OrientationLoop creates FocusCycle
-> selected candidate presents as ENGAGED
-> Persona creates current direct response
-> ArcStore records RESOLVED terminal fact
-> Cortex returns FocusCycle, FocusDecision, response, and trace evidence
```

## FocusCycle evidence

`Cortex.receiveSignal()` returns both:

- `focusCycle`: full candidate/decision evidence.
- `focusDecision`: compatibility shortcut to `focusCycle.decision`.

Candidate read models expose derived presentation state only:

- `presentationState`: `DerivedArcState` presentation value.
- `state`: compatibility alias for `presentationState` in current 0.05 read models.

## Salience v1

The v1 ruleset is `alpha-mvc-focus-cycle/v1`.

Terms are deterministic and auditable:

- `ACTIVATION_EVIDENCE`: `activated_at` / `ARC_ACTIVE` evidence that the Arc entered Cortex processing.
- `OPENING_EVIDENCE`: `created_at` / `ARC_OPEN` evidence that the unresolved Arc exists and is eligible for focus.
- `OPERATOR_RECENCY`: newest unresolved operator Arcs receive a deterministic recency bonus.
- `URGENCY_MARKER`: urgency words in title/target.
- `SECURITY_MARKER`: security/privacy/token/credential/leak/breach words in title/target.
- `TIE_BREAKER`: represented in decision reason; ties choose newest `created_at`, then lexicographically smallest Arc ID.

## Compatibility constraints

- Do not persist ArcState as operational authority.
- Do not persist `ENGAGED` as a long-lived state.
- Keep Persona free of salience scoring and FocusCycle ownership.
- Keep Arc lifecycle and inspection in ArcStore.
- Normal operator output must not expose raw Arc IDs through FocusCycle data. Debug/read-model surfaces may expose raw IDs for validation.
