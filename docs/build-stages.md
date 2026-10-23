# Build Stages — detail

Five stages. Each proves exactly one theoretical claim. The stage matrix,
one-line summaries, and production phases (A/B/C) live in the README,
"Building CARL." This file owns the proof obligations, scope limits,
and falsification conditions.

---

## Stage 0 — The Spine

*Claim: interface discipline, typed routing, event-driven coordination, and authority propagation hold under load with zero direct bus access.*

**Scope of claim — explicit limits.** Stage 0 proves the spine works:

- Interface discipline — no Faculty bypasses Synapse.
- Typed routing — no untyped payload reaches the bus.
- Authority propagation — origin stamp validated at every hop.
- Event-driven coordination — Persona consumes zero tokens at rest.
- Audit completeness — every Arc is reconstructable from trace logs alone.

**Stage 0 does NOT prove:**
Structural security broadly (policy bugs, schema confusion, authority-propagation bugs at scale, supply-chain compromise are all out of scope); resilience against compromised Faculty logic; correctness of risk classification; soundness of the System Evolution Boundary (deferred to Stage 4+); production-grade fault tolerance.

Stage 0 proves the architecture *runs* with the right shape. Broader security claims require later stages plus operational hardening.

**Stack:** TypeScript + Bun.

**Built (real from day one):** PRIME.md (loaded at boot, chmod 444, halts if missing), Synapse (EventEmitter wrapper), Nervous System (typed bus + Relay with Zod), Immune System (origin validation, permission registry, audit log), Faculty health registry (heartbeat tracking), trace logging (append-only, per-Arc reconstruction), Arc budgets (declared at open, enforced), Persona (async event loop, Arc Store as Map, zero tokens per cycle), Telegram Sensory Faculty (Grammy), one stub Execution Faculty.

**Hardcoded:** Reasoning Engine returns a static Execution Plan, Execution Faculty returns a static result, Reflex empty (no-op; the path is open), no ambiguity detection.

**Proof of life:** Operator → Telegram → Synapse → Immune System validates → Persona wakes → Arc opens with a budget → Reflex misses (corpus empty) → hardcoded plan → stub Faculty → Result Buffer → Synthesis Gate → Persona delivers → Arc resolved. Verify: no direct bus access, no untyped payload on the bus, zero tokens during wait, PRIME.md untouched, trace log reconstructable, budget tracked, health registry accurate.

**Falsification:** any Faculty published directly to the bus without Synapse, any untyped payload reached the bus, or PRIME.md was written to during the run.

---

## Stage 1 — Confirmed Intent

*Claim: detect lexical and single-wildcard ambiguity, reflect it back precisely, earn the right to act — never assume on this class.*

**Scope of claim — explicit limits.** Stage 1 proves *basic* ambiguity reflection only:

- Single wildcard field in compressed intent (e.g., domain unresolved).
- Lexical ambiguity (referent unclear at the word level).
- Irreversibility detection on declared-irreversible action classes.

**Out of scope for Stage 1 — deferred or unaddressed:**
Discourse-level ambiguity (referent depends on prior Arc context); pragmatic ambiguity ("clean this up and send it" — object, scope, destination, approval requirement all underspecified); multi-wildcard ambiguity (more than one field unresolved simultaneously); latent irreversibility (action looks reversible but has irreversible side effects); conflicting constraint detection across multiple operator inputs.

These remain open problems. Stage 1 does not solve general intent certainty — it solves the narrow case of single-wildcard lexical ambiguity with a structured re-validation flow.

**Added:** Persona basic ambiguity detection, partial compression with a single wildcard, re-validation rephrasing, proposal flow for declared-irreversible operations, first real model call (Execution Faculty, cheap model).

**Proof of life:** Unambiguous input → silent compression, Faculty dispatched. Single-wildcard ambiguous input → Persona reflects back, operator confirms, then dispatched. Declared-irreversible → proposal flow, operator confirms or cancels.

**Falsification:** single-wildcard ambiguous input triggered Faculty dispatch without confirmation, or a declared-irreversible action executed without the proposal flow. Out-of-scope ambiguity classes (discourse, pragmatic, multi-wildcard) are not falsification conditions for Stage 1 — they are acknowledged gaps.

---

## Stage 2 — The Learning Loop

*Claim: route caching with safety properties — cheaper at runtime, with poisoning resistance and decay, derived from operator-confirmed resolutions.*

**Scope of claim — explicit limits.** Stage 2 proves bounded local policy caching:

- Crystallized routes derive from operator-confirmed resolutions only.
- Reflex hit path enforces health, permission, confidence, and risk checks.
- Decay returns stale patterns to Cortex.
- Identity-scoped confidence prevents cross-operator trust transfer.
- LLM call count measurably drops on repeated matching intents.

**Stage 2 is NOT:** broad learning, concept formation, abstraction, transfer, or anything a research paper would call "learning" in the cognitive sense. It is discrete route caching with safety properties. This is where the cost curve bends: the majority of steady-state traffic no longer pays for a model call.

**Added:** Memory Faculty (Tier 1a Observation Log + Tier 1b Short Term + Tier 1c Crystallized), observation accumulation with dual-write to 1a and 1b, crystallization on threshold, Reflex corpus from crystallized entries, Reflex routing active, identity-scoped confidence, all Reflex safety constraints (health check, permission validation, confidence check, decay, operator override, risk-based fallback), instrumentation (crystallization events, Reflex hit outcomes, cost per request).

**Proof of life:** Repeated ambiguous confirmations → observations accumulate (Tier 1b working, Tier 1a immutable) → threshold → crystallization fires → Reflex entry written → next matching request: health ✓, permission ✓, confidence HIGH ✓ → Faculty dispatched directly, zero LLM calls. Measurable from instrumentation: LLM call count drops post-crystallization.

**Empirical validation requirement — Stage 2 is "designed safe" until the adversarial corpus passes; "empirically safe" only after.** Design correctness is necessary but not sufficient. The Reflex matching surface is the most likely failure surface in CARL — semantic drift across near-equivalent intents, adversarial phrasing at the classification boundary, and long-tail ambiguity not captured by `param_class` are all real risks even after the collision safeguards. Required before declaring Stage 2 empirically proven:

- Adversarial test corpus targeting the Reflex classification boundary (operator-curated intent pairs that *should* and *should not* collide on signature).
- Mutation-based fuzzing of intent phrasing within and across declared param_class boundaries.
- False-equivalence rate tracked as a first-class metric, surfaced in instrumentation alongside Reflex hit rate.
- Poisoning campaign simulation: single-origin spam, distributed origin coordination, gradual confidence climbing — verify the Reflex poisoning mitigations (rate anomaly, origin diversity, semantic distance, immutable log) trip before HIGH confidence is reached.

**Falsification:** semantically distinct requests collapse to the same route without a correction mechanism, adversarial phrasing poisons Reflex without anomaly detection, HIGH-confidence error rate exceeds the Cortex path error rate, false-equivalence rate is not measured, or any poisoning campaign reaches HIGH confidence undetected.

---

## Stage 3 — Continuous Entity

*Claim: continuously running cognitive entity managing multiple simultaneous Arcs.*

**Added:** True concurrent Arc processing, non-blocking Arc management, suspension/resumption, results delivered as ready.

**Proof of life:** Long-running Arc A + quick Arc B sent immediately after. Arc B resolves first, delivered immediately. Arc A unaffected, resolves independently.

**Falsification:** Arc B blocked on Arc A, Arc contexts share state, or results delivered in request order.

---

## Stage 4 — Self-Optimization

*Claim: tune a defined set of cost-performance thresholds within a compiled safety floor, driven by Resolution Records.*

**Scope of claim — explicit limits.** Stage 4 proves bounded threshold tuning:

- Four declared thresholds adjustable (Reflex confidence ceiling, Gating escalation trigger, Result Buffer window, Decomposer step ceiling).
- Adjustments derived from Resolution Records, not from operator-free heuristics.
- Safety floor is a compiled invariant — never crossed regardless of cost pressure.
- Quality ground truth must be operator-defined before the quality signal is used (no behavior proxies).

**Stage 4 does NOT prove:**
Self-improvement broadly (no new procedures learned, no new abstractions formed, no new concepts acquired); robustness against proxy failure if the quality rubric is poorly specified — that is an operator responsibility; generalization across operators or deployment contexts — tuning is per-instance; drift detection over arbitrary time horizons — requires red-team sampling outside Stage 4 scope.

This is bounded threshold tuning. It is not learning in the broad cognitive sense — it is policy parameter optimization within a fixed envelope.

**Added:** Resolution Records, Optimization Pass (threshold sweep as an Arc), automatic triggers, Tier 2 threshold updates.

**Proof of life:** Baseline cost distribution measured → 100 varied interactions → Optimization Pass triggered → thresholds adjusted within the safety floor → measurable cost reduction (higher Reflex %, lower Complex %) with no safety floor breach and no quality regression on the operator-defined rubric.

**Longitudinal observability requirement — Stage 4 is "bounded by design" always; "observed stable" only after longitudinal sampling confirms no drift.** The safety floor prevents catastrophic regression. It does not prevent gradual degradation within allowed bounds — outputs that remain technically correct while becoming progressively shallower, under-escalation that still passes the quality floor per-request but trends downward over weeks, confirmation loops that preserve low-cost behavior at the expense of depth. This is standard proxy failure; it is invisible at the request level and only visible across time. Required before declaring Stage 4 empirically stable:

- Longitudinal quality drift metric: rolling-window quality measurement on a held-out intent corpus, sampled at fixed intervals.
- Periodic Cortex-vs-Reflex-vs-optimized-path comparison: same intent run through all three paths, output quality compared on the operator rubric, divergence trended.
- Silent regression detection: alert when held-out corpus quality trends downward over N consecutive sampling windows even while the per-request quality floor is met.
- Operator drift report: surfaced as a regular Arc, presents drift trend with a recommended threshold reset if regression is detected.

**Falsification:** cost distribution did not shift, safety floor breached, quality ground truth not operator-defined before use, thresholds drifted outside the declared adjustable set, longitudinal drift metric not implemented, or held-out quality regression went undetected for more than the alerting window.

---

## Stage 5 — Dark Transit

*Claim: data can move through a cognitive architecture without any model ever reading it.*

**Added:** Dark Lane implementation, Blind Fetch / Blind Write, Inert-by-Default enforcement, content trust state tracking.

**Proof of life:** Blind Fetch — file fetched through the Dark Lane, Cortex receives metadata only, operator receives the file, an injected prompt injection never reached model context. Blind Write — API key carried to target; audit log confirms the key never appeared in any model call.

**Falsification:** cold payload appeared in model context, prompt injection influenced model output, the elevation protocol did not fire before any model read, or the audit log is missing the elevation event.
