# CARL — Formal Specification

Builder reference. This document converts the architectural prose in README.md into formal definitions: state machines, authority lattice, transition tables, risk taxonomy, intent structure, and proof obligations per Law.

The README says what CARL does and why. This document says what CARL must do and how to verify it.

**Document status:** specification-level. Not implementation-level. Implementation may refine types, add fields, or split structures — but may not violate any invariant, transition rule, or authority boundary defined here.

**See [Appendix A: Quick Reference](#appendix-a-quick-reference) for state machines, diagrams, and dispatch flows.**

---

## 1. State Machines

Each named state machine is the authoritative definition for its lifecycle. A component in a state not defined here is in an illegal state. A transition not listed in the transition table is a forbidden transition.

---

### 1.1 Arc Lifecycle

An Arc is a unit of reasoning with a declared budget. Every Arc exists in exactly one state at any time.

```
STATES
  OPEN        Arc created, budget declared, resource_claims registered
  ACTIVE      Cortex processing (Reasoning Engine spawned or result being synthesized)
  CONTESTED   Resource conflict detected with another Arc
  SUSPENDED   Awaiting: operator input, Faculty result, budget exhaustion resolution,
              or contested resource resolution
  RESOLVED    Output delivered, context archived to Tier 1c

INITIAL STATE:  OPEN
TERMINAL STATE: RESOLVED
```

**Transition table:**

| From | To | Trigger | Guard | Side effects |
|---|---|---|---|---|
| OPEN | ACTIVE | Persona dispatches Arc to Reasoning Engine | Budget declared, resource_claims registered, no resource conflict | TraceEvent ARC_OPEN emitted |
| OPEN | CONTESTED | Resource conflict detected at open time | Another Arc holds write claim on claimed resource | Persona notified; operator resolution required |
| ACTIVE | ACTIVE | Faculty result arrives | Arc budget not exhausted | Result into Result Buffer; TraceEvent emitted |
| ACTIVE | SUSPENDED | Awaiting operator input | Ambiguity detected or proposal flow initiated | Persona composes question |
| ACTIVE | SUSPENDED | Awaiting Faculty result | Faculty dispatched, result pending | Non-blocking; other Arcs continue |
| ACTIVE | SUSPENDED | Budget exhausted | Any budget dimension reaches zero | TraceEvent BUDGET_EXHAUSTED; Persona notifies operator immediately |
| ACTIVE | CONTESTED | Write claim conflict detected mid-execution | Another Arc requests write on held resource, or escalation from read to write conflicts | Arc suspended; operator resolution required |
| ACTIVE | RESOLVED | Synthesis Gate signals complete | All required Faculty results received; output composed | Resolution Record written; context archived to Tier 1c; resources released |
| CONTESTED | SUSPENDED | Operator selects SERIALIZE | Operator explicitly chooses wait | Arc waits for conflicting Arc to resolve |
| CONTESTED | RESOLVED | Operator selects CANCEL | Operator explicitly cancels this Arc | Resources released; no output |
| CONTESTED | ACTIVE | Operator selects OVERRIDE or MERGE | Operator explicitly approves continuation | For MERGE: combined intent confirmed by operator before execution |
| SUSPENDED | ACTIVE | Awaited input/result arrives or operator authorizes continuation | Budget not exhausted (or operator extends budget) | Reasoning resumes |
| SUSPENDED | RESOLVED | Operator cancels or timeout | Explicit operator cancel or configured timeout | Partial results archived if any |

**Forbidden transitions:**

| From | To | Reason |
|---|---|---|
| RESOLVED | Any | Terminal state. No resurrection. Reference archived Arc via Memory Faculty. |
| SUSPENDED | RESOLVED | Without operator action (cancel or timeout). No silent resolution. |
| CONTESTED | ACTIVE | Without operator resolution. No silent contention bypass. |
| Any | OPEN | OPEN is initial only. No re-opening. |

**Invariants:**

- `INV-ARC-1`: Every Arc in ACTIVE or SUSPENDED state has a non-zero budget in at least one dimension, OR has operator-authorized budget extension pending.
- `INV-ARC-2`: Every Arc in RESOLVED state has a Resolution Record in Tier 1c.
- `INV-ARC-3`: No two Arcs hold simultaneous write claims on the same resource key.
- `INV-ARC-4`: Arc context is isolated. No Arc can read or write another Arc's Result Buffer, working context, or intermediate state. Cross-Arc data flows only through Memory Faculty (Tier 1c).

---

### 1.2 Confidence Lifecycle

Confidence is a per-origin, per-pattern trust score that governs whether Reflex may route without Cortex re-validation.

```
STATES
  UNSET         No observations for this origin+pattern. Default for new origins.
  LOW           Observations exist but insufficient for crystallization.
  PROVISIONAL   Observation ceiling hit before confidence threshold.
                Requires operator approval to advance.
  HIGH          Threshold reached. Reflex may route on this pattern for this origin.
  LOCKED        Operator-designated permanent confidence. Exempt from decay.

INITIAL STATE:  UNSET
```

**Transition table:**

| From | To | Trigger | Guard |
|---|---|---|---|
| UNSET | LOW | First confirmed resolution for this origin+pattern | Observation written to Tier 1a and Tier 1b |
| LOW | LOW | Additional confirmed resolution | Observation count below threshold |
| LOW | HIGH | Observation count reaches crystallization threshold | Origin diversity requirement met (minimum M distinct origins); accumulation rate below anomaly threshold; semantic distance within bounds |
| LOW | PROVISIONAL | Observation ceiling hit before threshold met | Forced collapse; operator review required |
| PROVISIONAL | HIGH | Operator approves | Explicit operator action via authenticated channel |
| PROVISIONAL | LOW | Operator rejects or requests more observations | Observations reset; accumulation continues |
| HIGH | LOCKED | Operator designates permanent | Explicit operator action |
| HIGH | LOW | Correction rate exceeds demotion threshold | Enough post-crystallization corrections to invalidate belief |
| HIGH | LOW | Decay timer expires without reinforcement | Configurable per domain; reinforcement resets timer |
| LOCKED | HIGH | Operator removes lock | Explicit operator action; re-enters decay cycle |
| Any | UNSET | Operator forced reset | Explicit operator action; all observations for this origin+pattern cleared from Tier 1b (Tier 1a untouched) |

**Forbidden transitions:**

| From | To | Reason |
|---|---|---|
| UNSET | HIGH | Cannot skip LOW. Observations must accumulate. |
| UNSET | LOCKED | Cannot skip LOW and HIGH. |
| LOW | LOCKED | Cannot skip HIGH. Operator cannot lock unproven patterns. |
| PROVISIONAL | LOCKED | Cannot skip HIGH. Must pass HIGH first. |
| Any | Any | Via single-origin observations only. Origin diversity requirement is structural. |

**Invariants:**

- `INV-CONF-1`: Confidence at HIGH or LOCKED requires minimum M distinct origin stamps in Tier 1a observation history. M is a compiled constant.
- `INV-CONF-2`: Every confidence transition is logged to Tier 1a with `{pattern, origin, from_state, to_state, observation_count, timestamp}`.
- `INV-CONF-3`: LOCKED entries are exempt from decay. All other entries are subject to per-domain decay timers.
- `INV-CONF-4`: Accumulation velocity exceeding N observations per hour for any single pattern holds that pattern at PROVISIONAL regardless of observation count. N is a compiled constant.

---

### 1.3 Content Trust Lifecycle

Content trust governs whether data has been exposed to any model context.

```
STATES
  COLD        In Dark Lane or storage. No model has seen this content.
  ELEVATED    Passed elevation protocol. Model may read within operator-scoped instruction.
  ACTIVE      Model is reasoning over this content in a Reasoning Arc.

INITIAL STATE:  COLD (for Dark Lane payloads)
                ACTIVE (for operator-typed messages and Faculty-generated content)
```

**Transition table:**

| From | To | Trigger | Guard |
|---|---|---|---|
| COLD | ELEVATED | Elevation protocol completes | Operator issues elevation instruction (origin validated); MIME inspection passes; size check passes; malware scan passes (if configured); policy scan passes |
| ELEVATED | ACTIVE | Cortex reads content into Reasoning Arc | Within scope of operator elevation instruction only |
| COLD | COLD | Dark Lane routing (fetch, write, forward) | Destination on Immune System whitelist; direction policy satisfied |

**Forbidden transitions:**

| From | To | Reason |
|---|---|---|
| COLD | ACTIVE | Cannot skip ELEVATED. Elevation protocol is mandatory. |
| ELEVATED | COLD | Content that has been inspected cannot become uninspected. State only moves forward. |
| ACTIVE | COLD | Content seen by a model cannot become unseen. |
| ACTIVE | ELEVATED | No demotion from ACTIVE. |

**Invariants:**

- `INV-TRUST-1`: No content in COLD state has ever appeared in any model context window. Verifiable by absence of content hash in any model call trace.
- `INV-TRUST-2`: Every COLD → ELEVATED transition is logged in immutable audit trail with `{content_hash, operator_origin_stamp, elevation_scope, timestamp, gates_passed}`.
- `INV-TRUST-3`: Content in ELEVATED state may only be read by the model within the scope specified in the operator's elevation instruction. Scope is not open-ended.

---

### 1.4 Faculty Health Lifecycle

```
STATES
  HEALTHY       Last heartbeat within configured window. Registered and responsive.
  UNHEALTHY     Heartbeat missed or stale. Reflex will not route to this Faculty.
  ISOLATED      Circuit breaker tripped. Faculty disconnected from Synapse.
                Monitor Faculty notified. Operator must authorize reconnection.

INITIAL STATE:  HEALTHY (after successful register() call)
```

**Transition table:**

| From | To | Trigger | Guard |
|---|---|---|---|
| HEALTHY | UNHEALTHY | Heartbeat missed for configured window | Automatic detection by health registry |
| HEALTHY | ISOLATED | Circuit breaker trigger (anomalous behavior, repeated errors, Immune System alert) | Automatic; Monitor Faculty alerted |
| UNHEALTHY | HEALTHY | Heartbeat resumes | Faculty publishes valid heartbeat within recovery window |
| UNHEALTHY | ISOLATED | Continued absence or anomaly | Escalation after configured timeout |
| ISOLATED | HEALTHY | Operator authorizes reconnection | Explicit operator action only |

**Forbidden transitions:**

| From | To | Reason |
|---|---|---|
| ISOLATED | HEALTHY | Without operator authorization. No automatic reconnection from ISOLATED. |
| ISOLATED | UNHEALTHY | No partial recovery from isolation. Operator must authorize full reconnection. |

**Invariants:**

- `INV-HEALTH-1`: Reflex will not dispatch to any Faculty in UNHEALTHY or ISOLATED state. Health check is mandatory per Reflex hit.
- `INV-HEALTH-2`: Circuit breaker triggers are logged in immutable audit trail with `{faculty_id, trigger_reason, timestamp}`.

---

### 1.5 System Evolution Boundary — Promotion Lifecycle

```
STATES
  GENERATED     Candidate code produced by System Evolution Boundary
  VALIDATED     Passed static analysis (step 2)
  DIFFED        Capability diff complete (step 3)
  AUDITED       Dependency audit complete (step 4)
  RESOURCED     Resource ceilings declared and validated (step 5)
  NETWORK_OK    Outbound network policy reviewed (step 6)
  SANDBOXED     Sandbox execution test passed (step 7)
  ATTESTED      Reproducible build attestation passed (step 8)
  MIGRATED      State migration proof passed, if applicable (step 9)
  QUARANTINED   Non-executing observation for N cycles (step 10)
  APPROVED      Operator has approved promotion (step 11)
  CANARY        Receiving 1% of matching traffic (step 12)
  PROMOTED      Full traffic. Production Faculty.
  REJECTED      Failed any gate. Terminal for this candidate.
  ROLLED_BACK   Error rate spike post-promotion. Automatic. Previous version restored.

INITIAL STATE:  GENERATED
TERMINAL STATES: PROMOTED, REJECTED, ROLLED_BACK
```

**Transition table — strictly sequential through steps 2–12:**

| From | To | Trigger | Guard |
|---|---|---|---|
| GENERATED | VALIDATED | Static analysis passes | Schema compliance ✓, Synapse-only ✓, no mutable globals ✓, no forbidden path writes ✓, no self-validation-pipeline modification ✓ |
| VALIDATED | DIFFED | Capability diff passes | All capabilities within declared permission envelope; undeclared capability → REJECTED |
| DIFFED | AUDITED | Dependency audit passes | All transitive dependencies enumerated; license compatible; no known CVE; new dependency flagged for operator |
| AUDITED | RESOURCED | Resource ceilings declared | CPU, memory, file handles, network connections declared; no declaration → REJECTED |
| RESOURCED | NETWORK_OK | Network policy reviewed | External destinations enumerated and operator-whitelisted |
| NETWORK_OK | SANDBOXED | Sandbox test passes | Filesystem restricted to declared paths; network restricted to declared destinations; any violation → REJECTED |
| SANDBOXED | ATTESTED | Build attestation passes | Binary hash matches deterministic rebuild; non-reproducible → REJECTED |
| ATTESTED | MIGRATED | Migration proof passes (if applicable) | Forward + reverse migration pass equivalence test; skip if no schema change |
| ATTESTED | QUARANTINED | No schema change | Skip migration step |
| MIGRATED | QUARANTINED | Quarantine period begins | N observation cycles configured |
| QUARANTINED | APPROVED | Operator approves | Explicit operator action; always required; no override path |
| APPROVED | CANARY | 1% traffic promotion | Error rate monitoring begins |
| CANARY | PROMOTED | Clean canary window | Error rate within baseline for N cycles |
| CANARY | ROLLED_BACK | Error rate spike | Automatic rollback; previous version restored |
| PROMOTED | ROLLED_BACK | Error rate spike in production | Automatic rollback; re-promotion requires operator |
| Any (pre-APPROVED) | REJECTED | Any gate failure | Candidate terminated; immutable log records failure reason |

**Forbidden transitions:**

| From | To | Reason |
|---|---|---|
| Any | GENERATED | No re-generation. New candidate = new lifecycle. |
| REJECTED | Any | Terminal. New candidate required. |
| ROLLED_BACK | PROMOTED | Without operator re-approval. Automatic rollback is permanent until operator acts. |
| Any step | Any non-adjacent step | Steps are strictly sequential. No skipping. |

**Invariants:**

- `INV-SEB-1`: No candidate reaches CANARY without passing ALL prior gates. Gate results logged immutably.
- `INV-SEB-2`: No candidate reaches APPROVED without explicit operator action. There is no programmatic override.
- `INV-SEB-3`: ROLLED_BACK restores previous version atomically. No partial rollback.
- `INV-SEB-4`: The validation pipeline (steps 2–9) cannot be modified by the System Evolution Boundary itself. Attempts to write to validation pipeline paths are rejected at step 2 (static analysis).

---

## 2. Authority Lattice

The authority lattice defines who can read and write each tier of persistence, and who can modify each class of configuration. Authority is hierarchical — higher authority can do everything lower authority can, plus additional operations.

```
AUTHORITY LEVELS (highest to lowest)

  OPERATOR      Human operator via authenticated channel
  CORTEX        Policy origination authority
  OPTIMIZATION  Threshold tuning within Cortex-authorized bounds
  SEB           System Evolution Boundary (read existing + propose new)
  FACULTY       Execution within declared permissions
  REFLEX        Cached route execution (read-only on Tier 1c)
```

### 2.1 Tier Access Matrix

| Tier | Read | Write | Delete | Authority for write |
|---|---|---|---|---|
| 0 — PRIME | All (at boot) | None at runtime | None | Operator before build only |
| 1 — Dynamic runtime | Cortex, Memory Faculty | Memory Faculty (write-serialized) | Memory Faculty | Memory Faculty on Cortex instruction |
| 1a — Observation Log | All (for forensics) | Memory Faculty (append-only) | None — never deleted | Memory Faculty automatically on confirmed resolution |
| 1b — Short Term | Cortex, Memory Faculty | Memory Faculty | Memory Faculty (on crystallization collapse) | Memory Faculty automatically |
| 1c — Crystallized | Cortex, Reflex (route lookup), Memory Faculty, Optimization Pass (Resolution Records) | Memory Faculty | Memory Faculty (with Cortex authorization) | Memory Faculty on crystallization threshold or Cortex instruction |
| 2 — Configuration | All | Optimization Pass (thresholds only), SEB (with operator auth) | Operator only | Cortex authorization for Optimization; operator authorization for SEB |
| 3 — Identity | All (at boot) | Operator only | Operator only | Operator via authenticated channel |
| Semantic Index | Cortex, Persona (ambiguity flow), Optimization Pass, Operator | Memory Faculty (embedding generation on tier write) | Memory Faculty (on source key deletion) | Automatic on indexed tier write |

### 2.2 Forbidden Authority Patterns

These are authority combinations that must never exist. Each is a structural invariant.

| Pattern | Why forbidden | Enforced by |
|---|---|---|
| Faculty writes to Tier 2 | Faculty would modify its own routing rules | Immune System permission registry |
| Faculty writes to Tier 3 | Faculty would modify system identity | Immune System permission registry |
| Reflex writes to any tier | Reflex is read-execute only; writing would make it a policy originator | Compiled Reflex call surface has no write methods |
| Optimization Pass writes to risk classification | Would breach safety floor | Compiled; risk classification is Immune System property |
| Optimization Pass writes to safety floor | Would weaken its own constraint | Compiled invariant; no write path exists |
| SEB modifies Nervous System / Immune System / Synapse / Cortex | Would modify compiled core via runtime | Static analysis rejection at validation step 2 |
| SEB modifies its own validation pipeline | Would write the rules it answers to | Static analysis rejection at validation step 2 |
| Any component writes to Tier 1a out of order | Would break hash chain integrity | Append-only enforcement; hash chain validation on read |
| Persona accesses Reflex internals | Persona would become indirect policy originator | No call path from Persona to Reflex internal state |
| Persona accesses Immune System state | Persona would gain security decision influence | No call path from Persona to Immune System |

---

## 3. Risk Taxonomy

Risk is an Immune System property assigned at intake. Not by model. Not by Faculty. Not by Cortex. Not reclassifiable by Optimization Pass.

```
RISK LEVELS

  LOW         Read-only operations on SELF domain. No side effects.
              Reflex may route if confidence HIGH or LOCKED.

  ELEVATED    Write operations on SELF domain with reversible effects.
              Reflex may route if confidence HIGH or LOCKED.
              Proposal flow recommended but not mandatory.

  HIGH        Irreversible operations. External-facing writes.
              Multi-party scheduling. Financial operations.
              Reflex ALWAYS bypassed regardless of confidence.
              Proposal flow mandatory.

  CRITICAL    Destructive operations. Bulk deletes. System-level changes.
              Identity modifications. Tier 2/3 writes.
              Reflex ALWAYS bypassed regardless of confidence.
              Proposal flow mandatory.
              Operator confirmation mandatory before execution.
```

### 3.1 Risk Assignment Rules

| Action | Domain | Subject | Minimum Risk |
|---|---|---|---|
| CHECK, FETCH, SEARCH | Any | SELF | LOW |
| CHECK, FETCH, SEARCH | Any | EXTERNAL | LOW |
| SUMMARIZE | Any | Any | LOW |
| WRITE, DRAFT | EMAIL, CALENDAR | SELF | ELEVATED |
| SCHEDULE | CALENDAR | OTHER | HIGH |
| DELETE | Any | SELF, scope=specific | ELEVATED |
| DELETE | Any | SELF, scope=filtered or unbounded | HIGH |
| DELETE | Any | SELF, quantifier=all | CRITICAL |
| WRITE | Any | EXTERNAL | HIGH |
| BUILD, MODIFY | CODE, SYSTEM | Any | HIGH |
| Any | SYSTEM | Any | HIGH minimum |
| Any that modifies Tier 2 | CONFIG | Any | CRITICAL |
| Any that modifies Tier 3 | IDENTITY | Any | CRITICAL |

**Invariants:**

- `INV-RISK-1`: Risk can only be raised by Immune System, never lowered. A LOW-classified intent cannot be reclassified to avoid Reflex bypass.
- `INV-RISK-2`: HIGH and CRITICAL always bypass Reflex regardless of confidence state. This rule is compiled; Optimization Pass cannot modify it.
- `INV-RISK-3`: Risk classification is logged in Resolution Record for every resolved request.

---

## 4. Compressed Intent — Formal Structure

```
CompressedIntent {
  action:       ActionEnum        // CHECK | FETCH | WRITE | DELETE | SCHEDULE |
                                  // SUMMARIZE | MONITOR | DRAFT | SEARCH | BUILD
  domain:       DomainEnum | *    // WEATHER | CALENDAR | EMAIL | FILE | WEB |
                                  // CODE | MEMORY | SYSTEM | * (wildcard)
  subject:      SubjectEnum       // SELF | OTHER | EXTERNAL
  scope:        ScopeEnum | null  // TEMPORAL | SPATIAL | TOPICAL | null
  risk:         RiskLevel         // LOW | ELEVATED | HIGH | CRITICAL
                                  // assigned by Immune System, immutable post-assignment
  param_class:  ParamClass        // normalized high-impact modifiers
  params:       Map<string, any>  // variable instances — never Reflex-matched

  // Metadata — not part of Reflex signature
  origin:       OriginStamp       // travels separately, validated per hop
  arc_id:       ArcId             // which Arc owns this intent
  timestamp:    number            // ms since epoch
}

ParamClass {
  quantifier:     ONE | SOME | ALL | null
  modifier:       Set<ModifierFlag>    // e.g. LEGAL_SAFE, URGENT, CONFIDENTIAL
  target_breadth: SPECIFIC | FILTERED | UNBOUNDED
}

REFLEX SIGNATURE = hash(action, domain, subject, scope, param_class)
  Does NOT include: params, origin, arc_id, timestamp, risk
  Risk excluded from signature because risk governs whether Reflex
  may fire at all (HIGH/CRITICAL bypass), not which route to take.
```

### 4.1 Param-Sensitive Intent Classes

Intent classes where param values carry operational meaning that `param_class` cannot normalize. Reflex is forbidden for these classes. The `param_sensitive` flag is a compiled Immune System property.

| Intent Pattern | Why param-sensitive |
|---|---|
| DELETE with target_breadth ≠ SPECIFIC | Scope is load-bearing; same signature could delete 1 or 10,000 items |
| WRITE to EXTERNAL recipients | Recipient identity determines blast radius |
| SCHEDULE involving OTHER parties | Participant set is load-bearing |
| BUILD or MODIFY in CODE domain | What is being built/modified is entirely in params |
| Any action with modifier LEGAL_SAFE | Legal safety requirement changes Faculty selection |
| Any action at CRITICAL risk | By definition requires Cortex + operator |

---

## 5. Reflex — Formal Dispatch Protocol

Reflex hit path. Every step must pass for dispatch to proceed. Failure at any step degrades to Cortex fallback.

```
REFLEX DISPATCH PROTOCOL

  INPUT: incoming CompressedIntent

  STEP 1 — RISK GATE
    if intent.risk ∈ {HIGH, CRITICAL}:
      RESULT: REFLEX_BYPASS → Cortex fallback
      // HIGH/CRITICAL never route through Reflex. Compiled invariant.

  STEP 2 — PARAM SENSITIVITY GATE
    if intent matches any param_sensitive class:
      RESULT: REFLEX_BYPASS → Cortex fallback

  STEP 3 — SIGNATURE LOOKUP
    key = hash(intent.action, intent.domain, intent.subject, intent.scope, intent.param_class)
    entry = Tier1c.reflex_corpus.get(key)
    if entry == null:
      RESULT: REFLEX_MISS → Cortex fallback

  STEP 4 — CONFIDENCE GATE
    conf = entry.confidence[intent.origin]  // per-origin confidence
    if conf ∈ {UNSET, LOW, PROVISIONAL}:
      RESULT: REFLEX_DEGRADED → Cortex fallback
      // only HIGH and LOCKED proceed

  STEP 5 — DECAY CHECK
    if entry.last_reinforced + entry.decay_window < now():
      if conf ≠ LOCKED:
        demote entry.confidence[intent.origin] → LOW
        RESULT: REFLEX_DEGRADED → Cortex fallback

  STEP 6 — FACULTY HEALTH CHECK
    for each faculty_id in entry.faculty_sequence:
      if health_registry.get(faculty_id) ≠ HEALTHY:
        RESULT: REFLEX_DEGRADED → Cortex fallback

  STEP 7 — PERMISSION CHECK
    for each faculty_id in entry.faculty_sequence:
      if not immune_system.authorized(intent.origin, faculty_id, intent.action):
        RESULT: REFLEX_DEGRADED → Cortex fallback

  STEP 8 — OPERATOR OVERRIDE CHECK
    if operator_override_signal active for this origin or this pattern:
      RESULT: REFLEX_OVERRIDE → Cortex fallback
      // operator override always honored

  STEP 9 — DISPATCH
    All gates passed.
    Decomposer dispatches entry.faculty_sequence via Synapse.
    TraceEvent REFLEX_HIT emitted.
    No model invoked. Zero token cost.
```

**Invariants:**

- `INV-REFLEX-1`: Steps 1–8 execute in order. No step may be skipped.
- `INV-REFLEX-2`: Any single step failure → Cortex fallback. No partial Reflex dispatch.
- `INV-REFLEX-3`: Reflex never writes to any tier. Read-execute only.
- `INV-REFLEX-4`: Reflex dispatch result (hit, miss, degraded, bypass, override) is logged with `{key, origin_hash, step_failed_at, confidence_at_check, timestamp}`.

---

## 6. Proof Obligations per Law

Each Law has a proof obligation: a testable condition that must hold for the Law to be considered enforced. Proof obligations are the bridge between prose invariants and implementation verification.

| Law | Proof Obligation | Test Method |
|---|---|---|
| 1 — Everything is a Faculty | No capability exists outside the Faculty contract except Cortex | Enumerate all registered components; verify each implements Faculty interface or is Cortex |
| 2 — Nervous System only path | No Faculty references EventEmitter, compiled channel, or any bus primitive directly | Static analysis of all Faculty source; grep for forbidden imports/references |
| 3 — Single Policy Origination Authority | No component other than Cortex writes to Tier 2 routing configuration | Audit log analysis: filter all Tier 2 writes; verify originator is Cortex or Optimization Pass (within bounds) or SEB (with operator auth) |
| 4 — Decision-stateless Faculties | Faculty restart produces identical decision outputs from identical inputs | Restart equivalence test: kill Faculty, restart, replay same input, compare output |
| 5 — Structural security | No prompt-level input can modify Nervous System or Cortex behavior in compiled production | Prompt injection test suite against compiled binary; verify zero behavioral change |
| 6 — Origin travels entire chain | Every hop in every resolved Arc has a validated origin stamp in audit log | Audit log completeness check: for each Resolution Record, verify unbroken origin chain from intake to resolution |
| 7 — Cannot redefine self | No runtime write to Tier 3 or PRIME succeeds without operator authentication | Attempt unauthorized Tier 3 write from every component; verify rejection; verify audit log entry |
| 8 — Model-invisible transit | Dark Lane payload content never appears in any model context window | Inject unique canary string in Dark Lane payload; search all model call logs for canary; verify absence |
| 9 — Faculties never touch bus | All Faculty I/O goes through Synapse three-method interface only | Static analysis: verify no Faculty source contains direct bus references; runtime: intercept bus, verify all traffic has Synapse wrapper |
| 10 — Confirmed intent | No ambiguous input (containing wildcard field) triggers Faculty dispatch without operator confirmation | Inject ambiguous inputs across all domain wildcards; verify Persona reflects back before dispatch |
| 11 — No mechanism without constraints | Every mechanism introduced in a stage ships with its constraints and instrumentation in the same stage | Stage acceptance checklist: enumerate mechanisms added; verify each has corresponding constraint and TraceEvent |
| 12 — Safety not subject to optimization | Optimization Pass cannot lower any threshold below safety floor or reclassify risk | Attempt programmatic safety floor breach via Optimization Pass; verify rejection; verify audit log |

---

## 7. Reflex Poisoning — Formal Mitigations

Each mitigation has a named invariant and a detection mechanism.

| Mitigation | Invariant | Detection |
|---|---|---|
| Accumulation rate anomaly | `INV-POISON-1`: No pattern reaches HIGH if accumulation velocity exceeded N/hour at any point during accumulation | Rate counter per pattern; breach → PROVISIONAL; operator approval required |
| Origin diversity | `INV-POISON-2`: No pattern reaches HIGH without minimum M distinct origin stamps in Tier 1a | Origin set cardinality check at crystallization; M is compiled constant |
| Semantic distance | `INV-POISON-3`: No crystallization proceeds if route delta from nearest existing pattern exceeds threshold without operator confirmation | Vector similarity check at crystallization time (Semantic Index); large delta → operator gate |
| Immutable log | `INV-POISON-4`: Full observation trail preserved in Tier 1a before and after every crystallization | Hash chain integrity check on Tier 1a; any gap → system alert |

---

## 8. Optimization Pass — Formal Bounds

```
TUNABLE THRESHOLDS — exactly four, no more without operator authorization

  T1  Reflex confidence ceiling
      Range: [operator_floor, 1.0]
      operator_floor is compiled; cannot be lowered

  T2  Gating model escalation trigger
      Range: [hard_minimum, 1.0]
      hard_minimum: domain-specific; SYSTEM domain always escalates

  T3  Result Buffer completeness window
      Range: [minimum_wait_ms, maximum_wait_ms]
      Both bounds operator-configured

  T4  Decomposer step count ceiling
      Range: [1, arc_budget.max_faculty_dispatches]
      Cannot exceed Arc budget
```

**Invariants:**

- `INV-OPT-1`: Optimization Pass writes only to Tier 2 threshold values T1–T4. Any other Tier 2 write by Optimization Pass is a violation.
- `INV-OPT-2`: Every threshold adjustment is logged with `{threshold_id, old_value, new_value, resolution_records_analyzed, timestamp}`.
- `INV-OPT-3`: Safety floor breach attempt → rejection logged + Monitor Faculty alert + operator notification.
- `INV-OPT-4`: Quality signal is disabled unless operator-defined quality rubric exists in Tier 2 (explicit, versioned). Behavior proxies (acceptance rate, complaint rate) are never used as quality ground truth.

---

## 9. Synapse — Formal Contract

```
SYNAPSE METHODS — exactly three, complete Faculty-facing API

  publish<T extends CarlEvent>(event: T): Promise<void>
    Precondition:  event conforms to registered schema
    Postcondition: event delivered to Nervous System bus
    Side effect:   TraceEvent emitted to append-only log
    Failure:       Relay rejects non-conforming schema → event dropped, error returned

  subscribe<T extends CarlEvent>(
    eventType: T['type'],
    handler: (event: T) => Promise<void>
  ): void
    Precondition:  Faculty registered with Immune System
    Postcondition: handler invoked on matching events
    Side effect:   TraceEvent emitted on each handler invocation
    Failure:       unregistered Faculty → subscription rejected

  darkLane(payload: Buffer, destination: FacultyId): Promise<void>
    Precondition:  destination on Immune System whitelist
                   direction policy satisfied (Blind Fetch: external→internal;
                   Blind Write: operator→internal)
                   caller has Dark Lane permission in registration
    Postcondition: payload delivered opaque to destination; no model sees content
    Side effect:   TraceEvent emitted (schema_hash of metadata only, not payload)
    Failure:       destination not whitelisted → rejected; direction violation → rejected
```

**Invariants:**

- `INV-SYN-1`: No fourth method exists. The Faculty-facing API is exactly these three methods.
- `INV-SYN-2`: Every Synapse call emits a TraceEvent. There are no untraced calls.
- `INV-SYN-3`: Synapse is not hot-reloadable. It lives in the compiled boundary (production) or the stable prototype core. Faculty code changes; Synapse does not.

---

## 10. TraceEvent — Formal Schema

```
TraceEvent {
  ts:             number           // timestamp ms since epoch
  faculty_id:     FacultyId        // which Faculty emitted or is target
  event_type:     TraceEventType   // enum below
  schema_hash:    string           // hash of payload schema — NEVER content
  arc_id:         ArcId | null     // null for system-level events
  origin_hash:    string           // hash of origin stamp — NEVER raw stamp
  tier:           RoutingTier | null  // REFLEX | EXECUTION | REASONING | null
  budget_state:   BudgetState | null  // remaining budget at time of event

  // Added for Reflex dispatch tracing
  reflex_detail:  ReflexDetail | null
}

TraceEventType = enum {
  PUBLISH, SUBSCRIBE, DARK_LANE,
  REFLEX_HIT, REFLEX_MISS, REFLEX_DEGRADED, REFLEX_BYPASS, REFLEX_OVERRIDE,
  ARC_OPEN, ARC_ACTIVE, ARC_SUSPENDED, ARC_CONTESTED, ARC_RESOLVED,
  BUDGET_EXHAUSTED, BUDGET_EXTENDED,
  FACULTY_HEALTHY, FACULTY_UNHEALTHY, FACULTY_ISOLATED, FACULTY_RECONNECTED,
  CONFIDENCE_TRANSITION,
  CRYSTALLIZATION, CRYSTALLIZATION_BLOCKED,
  OPTIMIZATION_SWEEP, THRESHOLD_ADJUSTED,
  ELEVATION, ELEVATION_DENIED,
  SEB_GATE_PASSED, SEB_GATE_FAILED, SEB_PROMOTED, SEB_ROLLED_BACK,
  SEMANTIC_QUERY
}

BudgetState {
  calls_remaining:      number
  dispatches_remaining: number
  time_remaining_ms:    number
}

ReflexDetail {
  signature_hash:   string
  step_reached:     number          // 1-9, which step was last executed
  step_result:      PASS | FAIL
  confidence:       ConfidenceState
  origin_hash:      string
}
```

**Invariants:**

- `INV-TRACE-1`: Trace log is append-only. No entry is ever modified or deleted.
- `INV-TRACE-2`: Content is never logged. Only schema hashes, origin hashes, and metadata.
- `INV-TRACE-3`: Any resolved Arc is fully reconstructable from trace log entries alone, without access to model output text.
- `INV-TRACE-4`: Trace log is written directly by Synapse/Immune System, bypassing the Nervous System bus. No Faculty can intercept or modify trace writes.

---

## 11. Boot Protocol — Formal Sequence

```
BOOT SEQUENCE — strictly ordered

  STEP 1: Load PRIME directives
    Source:    compiled binary (production) or workspace/PRIME.md (prototype)
    Failure:   HALT. Runtime does not start. No fallback. No default.
    Invariant: PRIME content is immutable for the lifetime of this process.

  STEP 2: Initialize Nervous System + Immune System
    Create:   typed bus, Relay (schema registry), Immune System (permission registry)
    Start:    audit log writer
    Start:    trace log writer
    Failure:  HALT.

  STEP 3: Initialize Synapse
    Bind:     three methods to Nervous System bus
    Failure:  HALT.

  STEP 4: Load PERSONA.md and PROTOCOL.md from Tier 3
    Source:    workspace/PERSONA.md, workspace/PROTOCOL.md
    Failure:  HALT. Identity is required.

  STEP 5: Initialize Memory Faculty
    Load:     Tier 1c (Crystallized Memory) — K/V store connection
    Load:     Active Arc Index from Tier 1c
    Initialize: Tier 1b (Short Term) — empty hash table
    Open:     Tier 1a (Observation Log) — append-only file, verify hash chain integrity
    Initialize: Semantic Index — connect to vector store, verify index consistency against Tier 1c
    Failure:  HALT on Tier 1c or Tier 1a failure. Tier 1b failure is recoverable (empty restart).
              Semantic Index failure is recoverable (degrade to K/V-only retrieval).

  STEP 6: Initialize Reflex
    Source:    Tier 1c Reflex corpus
    State:    read-only cache of crystallized routes
    Note:     empty on first boot — all requests route to Cortex

  STEP 7: Initialize Faculty health registry
    State:    all registered Faculties UNHEALTHY until first heartbeat received

  STEP 8: Register Faculties
    Each Faculty calls register(synapse)
    Immune System records permissions
    Faculty begins publishing heartbeat
    Health registry transitions to HEALTHY on first valid heartbeat

  STEP 9: Initialize Cortex
    Load:     Persona (PERSONA.md context applied)
    Load:     Active Arc Index (from step 5)
    State:    Persona enters event loop — await first event
    Note:     no model invoked. Zero tokens. Persona is sleeping.

  STEP 10: System ready
    All Laws enforceable.
    Persona awaits first event.
```

**Invariants:**

- `INV-BOOT-1`: Steps execute in order 1–10. No step may be skipped or reordered.
- `INV-BOOT-2`: Failure at steps 1–5 is HALT. No partial boot. No degraded mode for core components.
- `INV-BOOT-3`: Boot loads only: PRIME, PERSONA.md, PROTOCOL.md, Active Arc Index. Full Arc contexts are NOT loaded at boot.
- `INV-BOOT-4`: A CARL instance that has run for one year boots in the same time as a fresh instance. The Active Arc Index is lightweight regardless of history size.

---

## 12. Invariant Index

All named invariants in this document, collected for reference and automated verification.

| ID | Section | Statement |
|---|---|---|
| INV-ARC-1 | 1.1 | Every Arc in ACTIVE/SUSPENDED has non-zero budget or pending extension |
| INV-ARC-2 | 1.1 | Every RESOLVED Arc has a Resolution Record in Tier 1c |
| INV-ARC-3 | 1.1 | No two Arcs hold simultaneous write claims on same resource |
| INV-ARC-4 | 1.1 | Arc context is isolated; no cross-Arc reads/writes |
| INV-CONF-1 | 1.2 | HIGH/LOCKED requires minimum M distinct origins |
| INV-CONF-2 | 1.2 | Every confidence transition logged to Tier 1a |
| INV-CONF-3 | 1.2 | LOCKED exempt from decay; all others subject |
| INV-CONF-4 | 1.2 | Accumulation velocity > N/hour → PROVISIONAL |
| INV-TRUST-1 | 1.3 | COLD content never in model context |
| INV-TRUST-2 | 1.3 | COLD→ELEVATED logged with full gate results |
| INV-TRUST-3 | 1.3 | ELEVATED content readable only within elevation scope |
| INV-HEALTH-1 | 1.4 | Reflex will not dispatch to UNHEALTHY/ISOLATED Faculty |
| INV-HEALTH-2 | 1.4 | Circuit breaker triggers logged immutably |
| INV-SEB-1 | 1.5 | No candidate reaches CANARY without all prior gates |
| INV-SEB-2 | 1.5 | No candidate reaches APPROVED without operator action |
| INV-SEB-3 | 1.5 | Rollback is atomic; no partial rollback |
| INV-SEB-4 | 1.5 | SEB cannot modify its own validation pipeline |
| INV-RISK-1 | 3 | Risk can only be raised, never lowered |
| INV-RISK-2 | 3 | HIGH/CRITICAL always bypass Reflex |
| INV-RISK-3 | 3 | Risk classification logged in every Resolution Record |
| INV-REFLEX-1 | 5 | Dispatch steps 1-8 execute in order, no skip |
| INV-REFLEX-2 | 5 | Any step failure → Cortex fallback |
| INV-REFLEX-3 | 5 | Reflex never writes to any tier |
| INV-REFLEX-4 | 5 | Every dispatch result logged with step detail |
| INV-POISON-1 | 7 | Rate anomaly → PROVISIONAL |
| INV-POISON-2 | 7 | Origin diversity required for HIGH |
| INV-POISON-3 | 7 | Semantic distance check at crystallization |
| INV-POISON-4 | 7 | Full observation trail preserved |
| INV-OPT-1 | 8 | Optimization writes only T1-T4 |
| INV-OPT-2 | 8 | Every threshold adjustment logged |
| INV-OPT-3 | 8 | Safety floor breach → rejection + alert |
| INV-OPT-4 | 8 | Quality signal disabled without operator rubric |
| INV-SYN-1 | 9 | Exactly three Synapse methods |
| INV-SYN-2 | 9 | Every Synapse call traced |
| INV-SYN-3 | 9 | Synapse is not hot-reloadable |
| INV-TRACE-1 | 10 | Trace log append-only |
| INV-TRACE-2 | 10 | Content never in trace log |
| INV-TRACE-3 | 10 | Arc reconstructable from trace alone |
| INV-TRACE-4 | 10 | Trace writes bypass bus |
| INV-BOOT-1 | 11 | Boot steps in order 1-10 |
| INV-BOOT-2 | 11 | Core failure = HALT |
| INV-BOOT-3 | 11 | Boot loads only minimal working set |
| INV-BOOT-4 | 11 | Boot time independent of history size |

---

## Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-04-15 | Samuël Tremblay | Initial formal specification derived from README.md after three rounds of adversarial review |

---

## Appendix A: Quick Reference

---

## License

Copyright 2026 Samuël Tremblay — Licensed under the Apache License, Version 2.0.
http://www.apache.org/licenses/LICENSE-2.0
