# CARL — Cognitive Autonomous Recursive Learning

CARL is a control architecture for AI systems that need to reason persistently, act safely, and improve through operation rather than retraining. Don't see it as a new Agent, but rather a new modern harness to drive real work and deliver real cost savings. **Its first goal is communication and organization of ideas and Arcs** — that's the core, and everything else (the tool layers, Reflex, orchestration, dark transit) is built around it. The **Cortex** is what is *aware* — and what *reasons*, *decides*, and *teams up with you*. That's where consciousness resides: the **Persona**, the **Orienting Loop**, the **Arcs**. It does not work. It *thinks and orchestrates everything*.

---

## 1. The Cortex

The **Cortex** is the part of CARL that decides. It is the reasoning core: the one place in the system where a model runs. Everything else — Faculties, the Nervous System, the gate — mediates or executes, but does not decide. **The Arcs are a component of the Cortex**: the work it carries and tracks is held in its **Arc store**, and nothing outside the Cortex writes into it.

Inside the Cortex there are four things:

- **Arc store** — every open Arc, in one place. The tracker from §2.
- **The orienting loop** — the part that is *awake, looking, actually choosing*. Tick-by-tick it re-derives the world from the Arc store: what changed, what matters now, which Arc can advance cheaply, what needs expensive reasoning. It is **event-driven and zero-cost at rest** — no model call unless an Arc step requires one. When idle it can go `UNCONSCIOUS` (cost-optimized, memory-tight) and the next operator touch wakes it back into its `CONSCIOUS`, operator-facing, mode.
- **The reasoning engine** — a subordinate loop, one per Arc that needs it. The only part of the Cortex that may run the expensive models (the deeper work, the planning).
- **The persona** — the identity that colors how it behaves. It shapes addressing, caution, and the rules of output (reflect ambiguity back, propose before an irreversible step, no protocol on the research channel). It does not decide.

In production the Cortex is compiled together with the Nervous System and the Immune System, with Prime Directives compiled in. Everything outside the Cortex reaches it through the Nervous System — and nothing reaches the Arcs except through the Cortex.

---

## 2. The Arc — inside the Cortex

An **Arc** is a way to keep track of the work being done and how the operator asked. One operator concern = one Arc: a goal that opens with a way of looking at it. **Story arc, in the feel of a TV series:** each Arc has a beginning, a stretch of tension, a resolution, and an end — and the Arc is the tracker that records the relationship between a concern and the system's attention, at every moment, queryable at any time.

An Arc is not a session, not a message, not a conversation. Its five states are the tracker's positions:

| State | What it means |
|---|---|
| `INCUBATING` | Carried, not yet in the contest. No invested claim yet. |
| `ENGAGED` | Held the focus in this tick. This tick, this Arc is what the system is working on. |
| `INHIBITED` | In the contest, outcompeted this tick. The claim is held; it re-enters on the next pass. |
| `RESOLVED` | Goal met. The relationship with the loop ends. |
| `ABSORBED` | Folded into another Arc. Terminated by incorporation. Everything about it is still auditable. |

### Plan maturity

A second, independent axis: how far the concern itself has unfolded, derived from the Arc's Task facts.

`UNDECOMPOSED → PLANNED → EXECUTING → RESOLVED`

The two axes are orthogonal. An Arc can be `INHIBITED` while `PLANNED` — plan built, focus elsewhere — or `ENGAGED` while the plan is `EXECUTING`.

### No state to save

The Arcs store only **facts**: title, target, lifecycle timestamps, budget, tasks, relations, resolution. All five states are **projected from the facts at query time**. What you see is always recomputed, so it cannot drift. This also gives it that property: when an Arc is what the current tick has engaged, it re-enters with its full context — not a re-reason from zero, but a continuation. That is why CARL never blocks: every tick ends by giving the hand back, and because nothing waits on itself inside, the system never stalls.

### Budget

The Arc also carries its own **budget**: max model calls, max Faculty dispatches, max wall time, and the resources it needs. Budget exhaustion means the Arc stops and the operator is told, and the operator either continues it or resolves it explicitly. No silent continuation.

### The interruption — why the hand comes right back

**CARL may forget to finish something because you interrupted him.** Not the way you are used to with agents: it's more like a human with too much on their plate. You do not have to re-prompt from zero. **CARL remembers the request; it was just busy with something else.** And the rush itself is under control (Inhibition): when many Arcs want the focus, the orienting loop scores them and the one it picks this tick gets processed. The rest are shelved for now — each is in the `INHIBITED` state, its claim held — and it re-enters on the next pass with its full context intact. No re-reasoning from zero, no burned tokens on work that isn't being engaged right now.

That is also where the cost argument lands. If the Arc were not isolated, the operator's interrupt would land on top of what is already running and scope-polluted the output, so the same job ends up re-run 2–3 times. Re-run is pure token + pure time, and that is where most of a model's waste is. The Arc keeps the work separated from the model context: the context is flushed after each pass, every Faculty sees only the job at hand, and the intended sequence executes **the first time, the right way**. Accuracy is the token economy.

Full derivation and projection algorithm: [`docs/cortex-persona-arc.md`](docs/cortex-persona-arc.md#arc).

---

## 3. The Nervous System

The Nervous System is the only backbone everything talks on. No model runs in it — it routes, validates, carries. In production it is compiled together with the Immune System and the Cortex as one binary, with the Prime Directives compiled in. **In that binary sits the skill index — a doc on a disk, versioned, edited, and deployed like code — the thing that decides charge and domain for every rule, and whose edit is the only thing that can legitimately change the rules.** Gate = index, in production.

- **Immune System** — the gate around every bus entry. **It is what blocks prompt injection:** it protects the Cortex and every Faculty from receiving orders they are not supposed to — and stops any Faculty that is not supposed to from polluting the Nervous System with hostile data. Origin-chain validation on every hop (Law 6); per-Faculty permission registry (Law 1); behavioral write restriction — Faculties write facts, never behavior; circuit breakers on anomalous Faculties (operator-approved re-connections); an audit log the gate itself writes, directly, so the gate itself cannot be bypassed from the bus.
- **Relay** — turns raw LLM text into a typed object (Zod in prototype, strict static types in Rust in production). A payload that fails the schema is rejected at the bus boundary. No untyped data on the bus, by construction.
- **Dark Lane** — a data path out from the inference path. Payloads in the Dark Lane are seen by no model and reasoned over by no model; the Cortex sees only metadata. Directed at fetches the operator has approved, token/secret writes, and cold files that should remain inert to prompt injection until the operator pulls them into a trusted state. Protocol: `SPEC.md` "Dark Transit".
- **Telemetry** — a live view of everything on the backbone. Current Arc, what each Faculty instance is doing, gate decisions, route choices, budget spend, message flow. Real-time. No model ever reads it — it is the *system's own view of itself*, and it is the first thing any operator sees when they open the dashboard.

---

## 4. The Faculties

A Faculty is any piece of capability in the system. One pattern, always: **subscribe through Synapse, execute, publish through Synapse.** Judgment-stateless between invocations (Law 4) — a crashed-and-restarted Faculty runs the same input and produces the same output.

- **Sensory** — receive external input, stamp the origin, publish. Telegram, file watchers, calendar events.
- **Execution** — act on the world within a bounded scope. Gmail, Calendar, Web, file IO, code.
- **Infrastructure** — maintain the system itself. Memory, Jobs, Monitor.

The **Memory Faculty** is where all persistence lives. It is not a tier on the bus — it is a Faculty that executes what the Cortex tells it to, and the place the state sits — because in CARL *everything* must be a Faculty (Law 1). Three working tiers:

| Tier | What it is | What it holds |
|---|---|---|
| 1a Observation Log | Append-only, hash-chain locked | Every raw observation (durable, immutable, never collapsed) |
| 1b Short Term | Volatile hash table | Working representation at hot-path latency, O(1). Collapses at threshold. |
| 1c Crystallized | Durable K/V | Collapsed beliefs, Reflex corpus, archived Arcs, arc index. What Reflex reads. |

Every ambiguity confirmation writes to 1a + 1b together. When a threshold fires, 1b collapses into 1c; 1a never moves. A Semantic Index (vector store) indexes 1a + 1c; it is a query interface, not a source of truth, and the Reflex path is not available there. Tier details and vector constraints: `SPEC.md`.

**The System Evolution Boundary** — the one component that can change CARL itself. It is a compiler-and-deploy pipeline, not an Execution Faculty in the same trust class as Gmail. 13-step promotion lifecycle; step 11 is operator approval, no override path. A compiled boundary keeps it from touching the Nervous System, the Immune System, Synapse, or the Core (and its own validation pipeline as well). Full lifecycle + threat model: `SPEC.md`.

---

## 5. The Reflex

**The Reflex is the cache *retrieval*.** The cache itself is in Memory (Tier 1c, where the crystallized routes live). When a new request comes in that matches a *re-query* — something you've asked before, possibly rephrased — the Reflex looks it up in Memory, fetches the previously-correct route, and replays it. No model starts up; no reasoning turn. Only the cost of the Faculty actually performing the action.

Reflex is **not** the store and **not** a mini-model on a smaller circuit and **not** a heuristic scorer: it is the lookup-and-replay path over what Memory holds. The direction is the point: every time the Cortex resolves a novel signal and the resolution crystallizes into a Reflex entry in 1c, Memory gets bigger, and the next matching query is answered at zero model cost.

Reflex does not decide — it **re-runs a route that the Cortex derived and approved.** No model, no inference. For every replay pass, four conditions are re-checked: Faculty health, permission against the origin stamp, confidence (HIGH or LOCKED), risk (HIGH or CRITICAL always bypass Reflex to Cortex). Failing any of them degrades to Cortex with a `REFLEX_DEGRADED` signal. Fast path — never a blind path.

That is also why Reflex stands on everything you read in §1–§4: the Immune gate (permission is still enforced before a route gets re-run), the conservation rule (the route is stored, not re-derived), Memory Faculty (it reads what the Memory Faculty holds), Routing (the replay goes where the literal route would have gone). The **crystallization loop** is this: operator confirms an ambiguity → observation is stored (1a + 1b) → threshold reached → 1b folds into a Reflex entry in 1c → next matching signal is served at zero cost. Every confirmation strengthens the fast path.

```
signal arrives
  → IMMUNE GATE            (origin + permission, always)
  → REFLEX CHECK           proven pattern?  -> replay (ZERO model calls)
  → ORIENTING LOOP         scores arcs this tick
  → GATING MODEL           picks the tier
  → EXECUTION FACULTY      cheap action or expensive inference
```

Without Reflex, every request — even one that's been repeated 200 times — pays for a model call. With it, the large share of steady-state traffic runs **no model at all.** That delta is where "real cost savings" lives.

**Queue, when the loop is lit.** When something big is mid-engagement (a long arc, a large-scale decision), the orienting loop's moves go into the small queue: the full-arc blocks, the queue is retained, and new signals are still processed cheaply (Reflex first), then when the arc releases — completed step, budget edge, ambiguity, or a safe yield point — they're served in order. Nothing is lost; the queue is the `INHIBITED` phase with a memory: what's retained holds the claim, and re-enters without re-reasoning.

## 6. The cast — one message, end to end

With all those pieces, here is who does what, and who lives where:

| Component | Role | Where it lives |
|---|---|---|
| **The orienting loop** | The decisive judgment of the whole system: which Arc is advanced in this tick. | Inside the Cortex |
| **The Arcs** | One operator concern each: goal, budget, state, shape of the request. | Inside the Cortex (Arc store) |
| **The Persona** | Identity: the address, the warmth, the presenter. Not the decider. | Inside the Cortex |
| **The reasoning engine** | High-cost thinking, a single loop per Arc. | Inside the Cortex |
| **The Nervous System** | The trunk: routing, verification, carrying. All lines traverse it. | Separate binary (compiled in production) |
| **The Immune System** | The gate: origin chain, permissions, write restrictions, circuit breaker. | Inside the Nervous System binary |
| **The Reflex** | No-model replay path: reruns routes the Cortex has already derived and approved. | Inside the Nervous System, on the fast path |
| **The Synapse** | The typed interface every Faculty speaks through. Law 9: direct-to-bus is not allowed. | Between every Faculty and the Nervous System |
| **Sensory Faculty** | Input: Telegram, file watcher. Stamps the origin. | Outside, talks via Synapse |
| **Execution Faculty** | Acts on the world: Gmail, Web, File IO, code. | Outside, talks via Synapse |
| **Memory Faculty** | All persistence: observation (1a), short-term (1b), crystallization (1c). | Outside, talks via Synapse |

The two halves do not directly touch each other: the Cortex talks to a Faculty, and the Faculty talks back to the Cortex, **"only through the Nervous System."** In reverse: every signal that passes through it is stamped with an origin (Law 6) and is only accepted by the Immune System. That is the trunk on which the brain communicates. Faculties never touch the bus — Synapse is a transport abstraction, and that is what makes core reimplementation (Law 9) never touch any Faculty code.

### One full message

The operator speaks; the full path, end to end:

```
operator message
  │
  ├─► Sensory Faculty          signal is emitted, origin stamped
  │
  ├─► NERVOUS SYSTEM           Immune-system gate validates origin + permissions
  │
  ├─► REFLEX                   Proven pattern?
  │     ├─ yes → replay a Cortex-derived route; zero model calls; respond.
  │     └─ no
  │
  ├─► ORIENTING LOOP           Scores open Arcs (the Cortex's judgment)
  │     └─ (if the active Arc is engaged: arbitration — 4 choices:
  │                                   defer / complete / queue / merge)
  │
  ├─► REASONING ENGINE         Gating decides the layer of the step
  ├─► FACULTY (via Synapse)    the step runs; result to Result Buffer
  │
  ├─► SYNTHESIS GATE           Arc is ready to return (or is halted)
  │
  └─► Operator gets the hand back.
```

That's the whole pass. Every component is named once with its job attached; everything after this is spec and prose.

---

## 7. Laws

Invariants. A system that violates any of these is not CARL.

1. **Everything is a Faculty.** Every capability follows the same pattern; the core never changes.
2. **The Nervous System is the only path.** No component talks directly with another.
3. **Single policy origination.** Only the Cortex originates or approves decision policy. Faculties do not re-derive it; Reflex only re-runs it.
4. **Faculties are decision-stateless.** Between any two calls of a Faculty, no decision state is carried that could change what it does.
5. **Security is structural, not prompt-based.** Authorization is enforced in code — compiled in production. No prompt can rewrite the rules.
6. **Origin travels the whole chain.** Every message carries an unforgeable stamp of who approved; each hop verifies it.
7. **CARL self-optimizes but cannot define itself.** Memory, reflexes, and thresholds can be auto-tuned; identity, protocol, and Prime Directives cannot.
8. **Model-invisible transit is first-class.** Data can move through CARL without a model ever seeing a single byte.
9. **No Faculty touches the bus directly.** All Faculty code goes through Synapse. Synapse is the abstraction that will allow the transport to change.
10. **Act only on confirmed intent.** Ambiguity reflects back before acting; irreversible actions are proposed before proceeding.
11. **No mechanism without its constraints.** Every mechanism ships its safety in the same stage. A mechanism without constraints is a violation.
12. **Safety cannot be the target of optimization.** The safety floor is a compiled invariant, not a tunable threshold.

Each Law has a named enforcement mechanism and a check that verifies it. The enforcement map is in `SPEC.md`.

One claim, from the original spec, that ties it together: **the Cortex speaks, the Faculties act, and the Nervous System is the only path between components.** Everything else follows from that sentence.

---

## 8. Building CARL

**Minimum Viable CARL = Stage 0: a bare Cortex you can talk to.** One message in, one model call, one reply out. No bus, no gate, no loop, no state. That's MVC. Everything else layers one stage at a time, each one adding exactly one capability the previous stage doesn't have.

**Stage map (what's being built, in order):**

| Stage | Name | What it adds |
|---|---|---|
| 0 | **Bare Cortex** | Input → model → output. No bus, no gate, no loop, no state. Just the raw call. |
| 1 | **Web Interface** | A web frontend the operator talks to the Cortex through. Browse, type, see the reply. Still one brain, one model, one reply. |
| 2 | **File Faculty** | The first real Faculty: read/write on the local disk. Arc-less for now — the model calls it directly. |
| 3 | **Web Faculty** | The second Faculty: web crawl. Still no Arc system: the model calls it directly when asked. |
| 4 | **Arc System** | Because there are tools to call, Arcs get tracked. Orienting loop (which Arc advances this tick), Arc store (goal, budget, state, shape of intent), 4-choice arbitration (defer / complete / queue / merge), budget enforcement. |
| 5 | **Continuous Entity** | Concurrent Arc processing: short tasks finish while long-running ones advance independently. Results ship the moment they're ready. |
| 6 | **Self-Optimization** | Cost-performance tuning of four named thresholds with a compiled safety floor, driven by Resolution Records. |
| 7 | **Dark Transit** | Data moves through the architecture and the model never reads it. |

**Phase A** hardens Synapse transport (zero Faculty code changes). **Phase B** compiles Nervous System + Immune System + Cortex to Rust (Faculties stay TypeScript). **Phase C** is full Faculty rollout + System Evolution Boundary (13-step lifecycle) + Optimization Pass on schedule.

Full detail (claims, scope, falsification, proof-of-life) lives in [`docs/build-stages.md`](docs/build-stages.md).

### The stack

| Component | Prototype | Production |
|---|---|---|
| Runtime | Bun | Bun (Faculties) + Rust (core) |
| Language | TypeScript | TypeScript (Faculties) + Rust (core) |
| Bus | Node EventEmitter through Synapse | Compiled typed channels via Synapse |
| Schema validation | Zod | Rust (comptime-style strict types) |
| Memory 1a / 1b / 1c | Append-only hash-chained file / In-process hash map / LevelDB or SQLite | Hash-chained file + archive / std HashMap / abstracted K/V |
| Semantic index | Local vector store (LanceDB, FAISS) over 1a + 1c keys | Abstracted vector index |
| Channel / LLM | Telegram (Grammy) / Vercel AI SDK | Same |

---

## 9. Where things live

| Path | What it owns |
|---|---|
| `SPEC.md` | Normative definitions: invariants, authority lattice, schemas, enforcement map, full protocols (Dark Transit, Reflex poisoning, Memory internals, SEB 13-step lifecycle, Optimization, Attention Arbitration), per-stage proof of life + falsification. |
| `docs/cortex-persona-arc.md` | Derivation of the Arc: Wallas stage mapping, INV-ARC 1–9, projection algorithm, "what the Arc is not," attention-arbitration details. |
| `docs/build-stages.md` | Stage-by-stage targets, scope claims, falsification conditions, and what each stage adds. |
| `TESTING.md` | Acceptance harness: static checks, replay tests, fixtures, adversarial corpus, stage gates. |
| `CONTRIBUTING.md` | Contribution rules, doc expectations, PR requirements. |
| `docs/plans/` | Roadmap and stage plans (review-required proposals — never permission to implement). |

Repo top level: `nervous-system/`, `synapse/`, `cortex/`, `faculties/` (memory, telegram, gmail, calendar, web, jobs, monitor), `system-evolution-boundary/`, `workspace/` (all `.md` — PRIME, PERSONA, PROTOCOL, SCHEMA, AGENTS), `examples/`, `tests/`, `harness/`.

### Scope statement

CARL is a bounded control architecture. What this document states:

- A design with named mechanisms and falsification conditions.
- A staged build path, with a verification obligation per stage.
- Threat models whose structural defenses answer to named surfaces.
- An explicit limit on what is claimed, at every level.

What this document does not provide:

- Proof that the implementation will behave as specified.
- Security proofs beyond what the compiled boundaries close (one class of attacks, not all).
- Claims about cognition beyond what the mechanisms demonstrably do.
- Proof of safe autonomy — operator gating exists precisely because autonomy is not yet trustworthy.

**Author.** Conceived and designed by **Samuël Tremblay** — Montréal, Québec, Canada — [github.com/barnacker](https://github.com/barnacker)

CARL is the phase where Samuël stops tweaking prompts and starts building the **harness side**: the context discipline, the skill inventory, the verifications, the permission model — the layer that used to sit between the operator and the model invisible, and is now built as a system, on purpose.

Apache 2.0 — see `CONTRIBUTING.md`.
