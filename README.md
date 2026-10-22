# CARL — Cognitive Autonomous Recursive Learning

CARL is a control architecture for AI systems that need to reason persistently, act safely, and improve through operation rather than retraining. Don't see it as a new Agent, but rather a new modern harness to drive real work and deliver real cost savings. Its central design choice is the separation of *decision policy* (Cortex) from *execution* (Faculties), mediated by a Nervous System that acts as a signal filter. Every other property follows from that separation. It adopts a **Biological Focus**, replacing traditional software locking mechanisms with **Competitive Inhibition** and **Temporal Decay**.

---

## 1. The Arc

An **Arc** is a way to keep track of the work being done. One operator concern = one Arc: a goal that fits with a way of looking at it. **Story arc, in the feel of a TV series:** each Arc has a beginning, a stretch of tension, a resolution, and an end — where the Arc is the tracker: it records the relationship between a concern and the system's attention, at every moment, queryable at any time.

An Arc is not a session, not a message, not a conversation. Its five states are the tracker's positions:

| State | What it means |
|---|---|
| `INCUBATING` | Held but not yet in the contest. No invested claim yet. |
| `ENGAGED` | Won the focus in this tick. This tick, this Arc is what the system is working on. |
| `INHIBITED` | In the contest, outcompeted this tick. The claim is held; it re-enters on the next pass. |
| `RESOLVED` | Goal met. The relationship with the loop ends. |
| `ABSORBED` | Folded into another Arc. Terminated by incorporation. Everything about it is still auditable. |

The Arc also carries its own **budget**: max model calls, max Faculty dispatches, max wall time, and the resources it need. Budget exhaustion means the Arc stops and the operator is told, and the operator either continues it or resolves it explicitly. No silent continuation.

### Plan maturity

A second, independent axis: how far the concern itself has unfolded, derived from the Arc's Task facts.

`UNDECOMPOSED → PLANNED → EXECUTING → RESOLVED`

The two axes are orthogonal. An Arc can be `INHIBITED` while `PLANNED` — plan built, focus elsewhere — or `ENGAGED` while the plan is `EXECUTING`.

### No state to save

Arcs store only **facts**: title, target, lifecycle timestamps, budget, tasks, relations, resolution. All five states are **projected from the facts at query time**. What you see is always recomputed, so it cannot drift. This also gives it that property: when an Arc is what the current tick has engaged, it re-enters with its full context — not a re-reason from zero, but a continuation. That is why CARL never blocks: every tick ends by giving the hand back, and because nothing waits on itself inside, the system never stalls.

When the Arc is defined as a pure tracking layer, it's also where the work is *kept*. Without this, the operator's interrupt lands on top of what is already running and scope-pollutes the output, so the same job ends up re-executed 2–3 times. Re-execution is pure token + pure time, and that is where the bulk of a model's waste is. The Arc keeps the work separated from the model context: the context is flushed after each pass, every Faculty sees only the job at hand, and the intended task sequence executes **the first time, the right way**. Accuracy is the token economy.

**CARL may forget to finish something because you interrupted him.** Not the way you are used to with agents: it's more like a human with too much on their plate. You do not have to re-prompt from zero. **CARL remembers the request; it was just busy with something else.** And the rush itself is under control (Inhibition): when many Arcs want the focus, the orientation loop scores them and the one it picks this pass gets processed. The rest are shelved for now — each is in the `INHIBITED` state, its claim held — and it re-enters on the next pass with its full context intact. No re-reasoning from zero, no confusion, no burned tokens on work that isn't on the mat right now.

## 2. The principle

One structural claim, from the original spec:

**Only Cortex tells. Faculties execute. The Nervous System is the only path between components.**

Everything else follows from this sentence:

- **No component can bypass the gate.** All traffic goes through the Nervous System. That makes the audit surface one, not N.
- **A capability is a plug-in.** A new capability is a new Faculty — it registers with the Nervous System and starts handling signals. The core is not touched.
- **Decision-making is not confused with doing.** Faculties do, Cortex tells. They do not talk to each other. When a new operator message arrives while another Arc is active, attention arbitration applies — safe-yield check, then the operator's four choices (defer, finish first, queue, or merge after merged-intent confirmation). One of them happens inside the active Arc, and the deferred Arc re-enters on the next salience pass.
- **Names are cognitive, not a claim.** Cortex, Nervous System, Faculty, Reflex - the names come from cognitive biology because the role correspondences are useful. Every claim in this document is tied to a named mechanism with a falsification condition.

### The laws

Invariants. A system that violates any of these is not CARL.

1. **Everything is a Faculty.** Every capability follows the same pattern; the core never changes.
2. **The Nervous System is the only path.** No component talks directly with another.
3. **Single policy origination.** Only Cortex originates or approves decision policy. Faculties do not re-derive it; Reflex only re-runs it.
4. **Faculties are decision-stateless.** Between two calls to a Faculty nothing is carried that could change what it does.
5. **Security is structural, not prompt-based.** Authorization is enforced in code - in production, compiled. No prompt can rewrite the rules.
6. **Origin travels the entire chain.** Every message carries an unforgeable stamp of who approved it; each hop verifies it.
7. **CARL self-optimizes but cannot redefine itself.** Memory, reflexes, and thresholds can be tuned automatically; identity, protocol, and prime directives cannot.
8. **Model-invisible transit is a first-class primitive.** Data can move through CARL without any model ever seeing a single byte of it.
9. **Faculties never touch the bus directly.** All Faculty code calls the Synapse. The Synapse is what the transport will change.
10. **Act only on confirmed intent.** Ambiguity is reflected back before acting; large actions are proposed before proceeding.
11. **No mechanism without its constraints.** A mechanism ships with its safety mechanism in the same step. A mechanism without constraints is illegal.
12. **Safety cannot be subject to optimization.** The safety floor is a compilation-invariant, not a tunable threshold.

Each law has a named enforcement mechanism. The enforcement map is in `SPEC.md`.

---

## 3. One message, end to end

This is how an Arc gets its fuel.

```
operator message
  │
  ├─► Sensory Faculty          signals published, origin stamped
  │
  ├─► NERVOUS SYSTEM           Immune System verifies origin chain + permissions at the gate
  │
  ├─► Reflex check             a proven pattern matches this signal?
  │     ├─ yes → replay a cached Cortex route; zero model context; respond.
  │     └─ no
  │
  ├─► CORTEX                   the loop of thought reads outstanding Arcs, scores salience,
  │                            opens or advances the Arc in convoy for this tick
  │
  ├─► REASONING ENGINE         Gating model picks the step's tier
  ├─► a FACULTY (via Synapse)  the step executes; result to Result Buffer
  │
  ├─► SYNTHESIS GATE           Arc is ready (or stopped) for output
  │
  └─► the operator receives the hand back.
```

Six components, in the order they are met:

- **Sensory Faculty** — input. Stamps the origin on the signal and publishes it. Across all of CARL this is the only component that publishes without being told by Cortex - it is the nose of the system.
- **Immune System** — the gate at the bus entry. Verifies the origin chain and permissions; rejects malformed or unauthorized packets before the bus; cuts off abnormal Faculties with a circuit breaker and adds the event to the log. Four jobs: origin-chain check, per-Faculty permission registry, write restriction on behavior, and a lock-in log written directly by the gate (circumvents the bus).
- **Reflex** — repeats proven paths; no models, no inference. Reads Crystallized Memory and re-runs what Cortex has already derived for the same class of intent. Every reflex pass re-checks four conditions - Faculty health, permission against origin stamp, confidence (HIGH or LOCKED), risk (HIGH or CRIT always bypasses Reflex to Cortex). A single miss downgrades to Cortex with a `REFLEX_DEGRADED` signal. Fast path - never a blind path.
- **Loop of thought** — the present moment. Each tick re-derives the world from the Arc store: what changed, what now matters, which Arc could advance cheaply, what needs expensive reasoning. One vote, one decision per tick; no model call required per cycle; zero tokens at rest. Losing the vote projects `INHIBITED` - the claim is held, not discarded.
- **Gating model** — a cheap model inside the Reasoning Engine, deciding which tier each step takes: Execution Faculty (cheap, bounded, short horizon) or Reasoning Faculty (expensive, deep). Certain domains require Reasoning by construction (structural changes, multi-step large actions); the boundary is not learned.
- **Synapse** — the typed interface every Faculty drives. Faculties never touch the bus directly, and in production the transport under Synapse can change without touching a single Faculty. This layer is where the "one path" promise is implemented.

### Why the hand comes back fast

The loop is both event- and tick-driven. Each tick ends by giving the hand back to the operator. When a new operator message in on a tick that is already advanced, the system asks whether the active Arc is at a safe yield point (waiting on a Faculty result, budget intact, bounded step ending). If safe, it yields; the new Arc takes the floor. If unsafe, the operator is given options: defer now, finish the step first, queue the new request, or merge. The deferred Arc can always re-enter later - it was never lost, only outcompeted. Over long enough, an Arc can also be `ABSORBED` into a related concern that better contains it; the original intent stays fully auditable in the embedded-Arc record.

---

## 4. The Nervous System

The central hub. Routes, verifies, carries. No model runs inside it - the Nervous System does not think. In production the Nervous System and Immune System are compiled together with the Prime Directives; in the prototype everything is in plain TypeScript with hard boundaries.

- **Immune System** — surround and gate all traffic. Origin-chain verification at every hop (Law 6); per-Faculty permission registry (Law 1); write restriction — Faculties can write facts, never behavior; a circuit breaker isolating an anomalous Faculty with an operator-approved reconnect path; and a lock-in audit log written directly, circumventing the bus.
- **Relay** — converts raw text to typed schemas. In the prototype: Zod. In production: compile-time types. A payload that does not validate is rejected at the bus boundary before entering the bus. No untyped data, by construction.
- **Dark Lane** — a model-invisible data path running alongside the inference path. Payloads through the Dark Lane are not seen by, or reason with, any model, and Cortex sees only metadata. Directed at outbound operator-approved fetches, inbound secret/token writes, and cold files that must be inert to prompt injection until the operator drops the elevation gates. Full protocol in `SPEC.md` ("Dark Transit").


Not a section by design: the Synapse interface code, TraceEvent schema, detail of Reflex anti-poisoning, and the Dark Lane elevation procedure. All are in `SPEC.md` - that is where reviewers need to find them.

---

## 5. Faculties

A Faculty is any capability in the system. Same pattern, always: subscribe through the Synapse, execute, publish through the Synapse. Decision-stateless between invocations: a crashed-and-restarted Faculty produces identical output for identical input (Law 4).

- **Sensory** — receive external input, stamp origin, publish. Telegram, file watchers, calendar events.
- **Execution** — act on the world with bounded scope. Gmail, Calendar, Web, file IO, code.
- **Infrastructure** — maintain the system itself. Memory, Jobs, Monitor.
- **System Evolution Boundary** — one component that can modify CARL itself. Structurally distinct from an ordinary Faculty: it is a compiler-and-deploy pipeline and not a Faculty in the same trust class. Bounded by a 13-step promotion lifecycle - step 11 is operator approval, no override path - and by a compiled boundary that prevents it from touching the Nervous System, Immune System, Synapse, or Core (and from modifying prime directives or its own validation pipeline). Full lifecycle and threat model in `SPEC.md`.

Memory and reflexes are inside the **Memory Faculty** — where all persistence in the system lives. Three working tiers:

| Tier | What it is | What it holds |
|---|---|---|
| 1a Observation Log | Append-only, hash-chain locked | Every raw observation (durable, immutable, never collapsed) |
| 1b Short Term | Volatile hash table | Working representations at hot-path latency, O(1). Collapses at threshold. |
| 1c Crystallized | Durable K/V | Collapsed beliefs, Reflex corpus, archived Arcs, arc index. What Reflex reads. |

Every ambiguity confirmation writes to 1a + 1b together. When a threshold fires, 1b collapses into 1c; 1a never moves. A Semantic Index (vector store) indexes 1a + 1c; it is a query interface, not a source of truth, and the Reflex path is not available there. Tier specifics and vector constraints: `SPEC.md`.

Why Memory sits inside a Faculty instead of being a tier-0 bus: because the need for persistence is one of the capabilities of the system. And because of Law 4 (decision-stateless), Memory is where the state is, and a Faculty that executes what Cortex tells it to.

---

## 6. Building CARL

Five steps. Each proves exactly one theoretical claim. **Minimum Viable CARL = steps 0 + 1 + 2.** Steps 3–5 extend beyond MVC.

| Component / Mechanism | S0 Spine | S1 Signa | S2 Learned path | S3 Continuous | S4 Self-Opt | S5 Dark transit | MVC? |
|---|---:|---:|---:|---:|---:|---:|---|
| Prime directives | Req | Req | Req | Req | Req | Req | Yes |
| Synapse | Req | Req | Req | Req | Req | Req | Yes |
| Nervous System + Relay | Req | Req | Req | Req | Req | Req | Yes |
| Immune System | Req | Req | Req | Req | Req | Req | Yes |
| Trace / audit log | Req | Req | Req | Req | Req | Req | Yes |
| Persona event loop | Req | Req | Req | Req | Req | Req | Yes |
| Arc budget + resource needs | Req | Req | Req | Req | Req | Req | Yes |
| Basic ambiguity flow | Stub | Req | Req | Req | Req | Req | Yes |
| Memory Faculty Tier 1a/1b/1c | Min | Min | Req | Req | Req | Req | Yes |
| Reflex corpus + dispatch | Empty | Empty | Req | Req | Req | Req | Yes |
| Faculty health registry | Req | Req | Req | Req | Req | Req | Yes |
| System Evolution Boundary | — | — | — | Req | Req | Req | No |
| Semantic Index | — | — | — | Opt | Opt | Opt | No |
| Optimization Pass | — | — | — | — | Req | Req | No |
| Dark Lane / Dark transit | — | — | — | — | — | Req | No |

MVC is step 0–2 only. Components marked non-MVC must not be treated as preconditions for the first working CARL instance.

One line per step (full claims, proof-of-life, falsification conditions in `docs/build-stages.md`):

- **Step 0 - The Spine.** Typed routing, authority propagation, and event-driven coordination are held at zero direct bus access.
- **Step 1 - Confirmed intent.** Single-wildcard ambiguity is detected, reflected back, and confirmed before routing; large actions are proposed before proceeding.
- **Step 2 - The Learning Path.** Confirmed resolutions freeze into Reflex routes, with confidence scoped by origin and decay; LLM call count on repeated intents measurably decreases.
- **Step 3 - Continuous entity.** Concurrent Arc management: quick work completes quickly while long work advances independently.
- **Step 4 - Self-optimization.** Cost-performance tuning of four named thresholds, within a compiled safety floor, driven by Resolution Records.
- **Step 5 - Dark transit.** Data moves through the system without any model ever reading it.

How this gets to production, after the 5 steps:

- **Phase A - messaging hardening.** Swap Synapse internals for a hardened transport. Zero Faculty changes (Law 9 is doing its job).
- **Phase B - Zig compilation.** Nervous System + Immune System + Cortex compiled as Zig binaries, Prime Directives compiled in. Faculties stay TypeScript forever.
- **Phase C - full deployment.** All Faculty categories live. System Evolution Boundary builds Faculties prospectively under the 13-step lifecycle. Optimization Pass on automated schedule.

---

## 7. Where things live

| Path | What it owns |
|---|---|
| `SPEC.md` | Normative definitions: invariants, authority lattice, schemas, enforcement map, full protocols (Dark transit, Reflex, Memory tiers, System Evolution Boundary, Optimization, arbitration), falsification conditions. |
| `docs/cortex-persona-arc.md` | The Arc derivation: Wallas-stage mapping, INV-ARC 1-9, projection algorithm, "what the Arc is not." |
| `docs/build-stages.md` | Per-step scope claims, proof-of-life, falsification conditions, lists of what each step adds. |
| `TESTING.md` | Acceptance harness: static checks, replay tests, fixtures, adversarial corpus, step gates. |
| `CONTRIBUTING.md` | Contribution rules, docs expectations, PR requirements. |
| `docs/plans/` | Roadmaps and step plans (proposals pending review - never implementation credits). |

Repository top level: `nervous-system/`, `synapse/`, `cortex/`, `faculties/` (Memory, Telegram, Gmail, Calendar, Web, Jobs, Monitor), `system-evolution-boundary/`, `workspace/` (PRIME, PERSONA, PROTOCOL, SCHEMA, AGENTS — all `.md`), `examples/`, `tests/`, `harness/` (fake-world test driver).

### Scope statement

CARL is a bounded control architecture. What this document states:

- A design with named mechanisms and falsification conditions.
- A staged build path with per-step verification obligations.
- A threat model with per-named threat-surface structural defenses.
- Explicit limits on what is claimed, at every level.

What this document does not provide:

- Proof that the implementation will behave as specified (requires a live system and assertion).
- Security proof beyond what compile-time boundaries close (one attack class, not all).
- A claim of cognition beyond what mechanisms demonstrably perform.
- Autonomous safety proof - operator gating exists precisely because autonomy is not yet trusted.
- Proof that a trajectory toward general intelligence will succeed.

The five preconditions of general intelligence — persistence across time, experience accumulation, bounded self-modification, control of decision policy, and cost-performance scaling under growth — are all present in CARL as explicit mechanisms. They are preconditions, not sufficient capabilities, and the architecture does not claim abductive learning, cross-domain transfer, or open-ended planning beyond bounded decomposition. `SPEC.md` has the full partial-scope statement.

**Author.** Conceived and designed by Samuël Tremblay - Montréal, Québec, Canada - [github.com/barnacker](https://github.com/barnacker). Apache 2.0, see `CONTRIBUTING.md`.
