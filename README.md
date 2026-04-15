# CARL — Cognitive Autonomous Recursive Learning

CARL is a control architecture for AI systems that need to reason persistently, act safely, and improve through operation rather than retraining. Its central design choice is the separation of *decision policy* (centralized, audited, traceable to one authority) from *execution* (distributed, bounded, replaceable). Every other property follows from that separation.

The biological terminology — Cortex, Nervous System, Immune System, Faculty, Reflex — is a naming convention, not a proof framework. It selects names from cognitive biology because the role correspondences are useful for navigation. It does not claim biological fidelity, biological completeness, or that CARL "thinks" in any sense beyond what its mechanisms demonstrably do. Where the architecture makes a claim that resembles a cognitive property (persistence, accumulation, recursion), that claim is grounded in a named mechanism with a falsification condition, not in the analogy.

| Dimension | Agent Frameworks | CARL |
|---|---|---|
| Reasoning | Each agent reasons independently | Only Cortex originates decision policy |
| Security | Prompt-based, bypassable | Structural, compiled, code-enforced |
| Routing | Static role assignment | Dynamic, learned via Reflex caching |
| Execution | Agent decides and acts | Faculty executes Cortex-derived plans only |
| Data transit | All content enters model context | Dark Lane — model-invisible transit |
| Learning | External retraining | In-process route caching + threshold tuning |
| Trust | Assumed | Earned per identity, per pattern, per origin |
| Operation | Request-response, blocking | Continuous, multitasking, non-blocking |
| Self-modification | Ad hoc or absent | System Evolution Boundary with operator-gated lifecycle |

In agent frameworks, each agent reasons about what it should do next and acts on that reasoning. In CARL, Faculties execute what Cortex derived — they do not decide what happens next. Cortex is the only component authorized to originate or change decision policy. Security boundaries are structural, routing is centralized, and self-modification is isolated to a separate trust tier (the System Evolution Boundary) with its own lifecycle precisely because it operates on the architecture itself rather than on the world.

One persistent reasoning core. Infinite specialized Faculties. Each Faculty potentially multi-model. A step toward general intelligence architecture.

The phrase "step toward" is directional, not aspirational. General intelligence — under any implementation path — requires at minimum five architectural preconditions. CARL introduces explicit mechanisms for all five:

| Precondition | CARL Mechanism |
|---|---|
| Persistence across time | Persona main loop + Arc system + Boot Protocol (instance survives restart with identity, patterns, and pending work intact) |
| Accumulation of experience | Memory Faculty Tier 1a (Observation Log, immutable) + Tier 1c (Crystallized) + Reflex corpus |
| Bounded self-modification | System Evolution Boundary (Coding Faculty) under operator-gated lifecycle |
| Control over decision policy | Cortex as single origination authority (Law 3) + compiled Immune System enforcement |
| Cost-performance scaling under growth | Optimization Pass within compiled safety floor (Law 12) |

These are necessary preconditions, not sufficient capabilities. CARL does not claim — and the architecture does not provide — generalized abstraction learning, cross-domain transfer, autonomous goal formation, causal world modeling, or open-ended reasoning beyond bounded decomposition. Those are higher-order capabilities that must sit on top of a stable control architecture. CARL defines that control layer.

---

## Anticipated Objections

Three objections recur in adversarial review of this architecture. Each is addressed once here for the reader who wants the answer before reading the full spec.

**Objection 1 — "You claim a single reasoning locus, but Reflex, the Gating model, the Optimization Pass, and Persona framing all make decisions. That is multiple reasoning loci with extra steps."**

Law 3 distinguishes *originating* decision policy from *executing* it. Reflex is cached policy execution — routes Cortex previously derived, made durable, executed without re-reasoning. The Gating model operates within Cortex-authorized escalation bounds defined as hard constraints, not learned behavior. The Optimization Pass tunes four named thresholds within a compiled safety floor it cannot breach. Persona is structurally restricted to presentation and interaction — its allowed and forbidden surfaces are enumerated and architecturally enforced (Persona has no call path to Reflex internals or Immune System state). None of these components originate decision policy. They execute or tune within bounds Cortex authorized. The distinction is the architecture's central commitment, not a rhetorical one.

**Objection 2 — "Compiled core does not equal secure architecture. You are claiming structural security where you only have one class of attack surface closed."**

Correct, and the document agrees. Law 5 reads in full: *"Compilation eliminates prompt-level tampering with Nervous System and Cortex internals. It does not solve architectural trust, policy bugs, unsafe schema assumptions, or incorrect authority propagation. Those require explicit validation, auditing, and operational monitoring."* The threat model under the System Evolution Boundary section enumerates eight attack surfaces with named defenses for each. Stage 0's claim was narrowed to "interface discipline + typed routing + authority propagation" precisely because broader security is not Stage 0's claim to make. Compiled boundaries close one specific class of attacks. They do not close all classes, and the document does not claim they do.

**Objection 3 — "What you call 'learning' is route caching plus threshold tuning. That is not learning in any cognitive sense."**

Correct. Stage 2 explicitly describes itself as discrete route caching with safety properties, not broad learning. Stage 4 explicitly describes itself as bounded threshold tuning within a compiled safety floor, not self-improvement. The "L" in CARL refers to in-process pattern crystallization derived from operator-confirmed resolutions — useful, bounded, and honestly named. CARL does not learn new procedures, new abstractions, new concepts, or new causal structure. The recursive loops described in the next section are policy caching loops, not concept formation loops. If your test for "real learning" requires the latter, CARL fails it — and was not designed to pass it.

---

## What Makes CARL Recursive

Recursion is a property that emerges from several reinforcing loops operating simultaneously.

**Reflex crystallization.** Cortex resolves a request. The compressed intent and Faculty route are written to Memory. Memory crystallizes the pattern. The next matching request routes directly — no Cortex, no LLM, no cost. That resolution generates a new pattern. The loop feeds itself.

**Faculty chaining.** Cortex dispatches to Faculty A. Faculty A's result triggers dispatch to Faculty B. Chain depth is not fixed — Cortex decides at each step within Arc budget. This loop is bounded by Arc budget exhaustion (max_faculty_dispatches), not by recursion structure.

**System Evolution Boundary self-extension.** The System Evolution Boundary reads existing Faculty source, writes candidate Faculty source, and — after passing the 13-step promotion lifecycle and operator approval — hot-reloads the result. That new Faculty begins handling requests that feed the Reflex loop. This loop is bounded by operator approval at step 11; no autonomous self-extension is possible.

**Arc context accumulation.** Each Faculty result fed back into the active Reasoning Arc changes what Cortex does next within that Arc. This loop is bounded by Arc resolution; context does not persist across Arcs except through Memory Faculty writes.

**Confidence compounding.** As crystallized patterns accumulate, Reflex handles more requests. More Reflex hits means fewer Cortex invocations. More throughput generates more crystallization candidates. This loop is bounded by Reflex confidence thresholds, decay, and the Patch 9 adversarial validation requirements — pattern accumulation cannot exceed safety floor.

**Threshold self-optimization.** Every resolved request generates a Resolution Record. The Optimization Pass reads these records and tunes four named thresholds within bounds Cortex authorizes — the system biases toward the cheapest viable path subject to the compiled safety floor (Law 12). This loop is bounded by the safety floor (cannot be tuned away) and by the Patch 10 longitudinal observability requirements.

Each loop is *recursive in the system-level sense* — output feeds back into input over time. None of these loops is recursive in the *concept-formation* sense. They are policy-caching, route-extension, and threshold-tuning loops. The "Recursive" in CARL's name refers to this system-level feedback structure, not to recursive learning of new abstractions.

---

## Laws

Invariants. A system that violates any of these is not CARL.

**Law 1 — Everything is a Faculty.** Every capability follows the same pattern: subscribe through the Synapse, execute, publish results. Adding capability means adding a Faculty. The core never changes. Cortex is the single exception — above the Faculty pattern.

**Law 2 — The Nervous System is the only path.** No component communicates with another directly. All traffic flows through the Nervous System. One path means one gate.

**Law 3 — One Reasoning Locus.** Only Cortex may originate or authorize durable decision policy. Faculties execute what Cortex derived. Reflex is cached policy execution: routes Cortex previously derived, made durable. Multiple Reasoning Engine instances may run concurrently — one per active Arc. "One locus" refers to origination and authorization of decision policy, not runtime execution.

**Law 4 — Faculties are decision-stateless.** Faculties carry no decision state between invocations. All persistence that influences decisions lives in Memory Faculty only. Operational state (connection pools, cached clients, retry metadata) is permitted when explicit, typed, and auditable. Hidden operational state is forbidden. A Faculty that crashes and restarts produces identical decision outputs from identical inputs.

**Law 5 — Security is structural, not prompt-based.** Authorization is enforced in code. In production, the core is compiled — no source for a model to read or modify at runtime. Compilation eliminates prompt-level tampering. It does not solve architectural trust, policy bugs, or incorrect authority propagation — those require explicit validation and monitoring.

**Law 6 — Origin travels the entire chain.** Every request carries an immutable stamp of who authorized it. Authority cannot be invented mid-chain. Each hop is validated against the original stamp.

**Law 7 — CARL self-optimizes but cannot redefine itself.** CARL can crystallize Reflex patterns, tune thresholds, and update factual memory autonomously. CARL cannot modify its own identity, protocol, or Immune System rules without operator authorization. CARL cannot modify its Prime Directives under any circumstances.

**Law 8 — Model-invisible transit is a first-class primitive.** Content can move through the architecture without entering any model context. Files, secrets, tokens, and payloads can be fetched, routed, and written without any model consuming them as tokens.

**Law 9 — Faculties never touch the bus directly.** Faculty code calls the Synapse — the typed abstraction layer between Faculty runtime and the Nervous System. This indirection makes the TypeScript-to-Zig evolution possible without rewriting any Faculty.

**Law 10 — Act only on confirmed intent.** Confidence is earned, not assumed. Ambiguous input is reflected back before routing. Low-confidence patterns re-validate before executing. Irreversible actions propose before they proceed. Silent routing is a privilege earned through repeated confirmed correct interpretation.

**Law 11 — No mechanism without its constraints.** No capability is introduced without its safety constraints and observability instrumentation implemented in the same stage. A mechanism that exists without its constraints is a violation.

**Law 12 — Safety is not subject to optimization.** The Optimization Pass minimizes cost subject to safety constraints — not cost unconstrained by safety. The safety floor is a compiled invariant, not a tunable threshold. Risk classification is an Immune System property — the Optimization Pass cannot reclassify what is safe.

**Enforcement map.** Each Law has a named structural enforcement mechanism. Laws stated as principle without enforcement would be policy hopes; the architecture grounds them in code-level boundaries.

| Law | Enforced by | Verifiable through |
|---|---|---|
| 1 — Everything is a Faculty | Faculty Contract registration in Immune System | Faculty without contract cannot register |
| 2 — Nervous System is the only path | Synapse abstraction layer; Faculty code has no bus reference | Static analysis at validation step 2 of System Evolution Boundary lifecycle |
| 3 — One Reasoning Locus | Reflex/Gating/Optimization call paths cannot author routes; only Cortex writes to Tier 2 routing | Trace log shows route origination authority per Resolution Record |
| 4 — Faculties are decision-stateless | Faculty Contract requires explicit operational state declaration; hidden state rejected at validation | Restart equivalence test on identical inputs |
| 5 — Security is structural | Compiled core (production); chmod 444 on PRIME.md (prototype); halt-on-missing | Build attestation; runtime halt verification |
| 6 — Origin travels the entire chain | Immune System validates origin stamp at every hop | Audit log entries per hop with origin hash |
| 7 — Self-optimizes but cannot redefine | Tier 3 (PERSONA.md, PROTOCOL.md) operator-only writes; PRIME.md compiled | File permission enforcement + compilation boundary |
| 8 — Model-invisible transit | Dark Lane carries opaque payloads; never enters model context window | Trace log absence of payload schema_hash in any model call |
| 9 — Faculties never touch bus directly | Synapse interface is the only Faculty-facing API | Static analysis: no EventEmitter or compiled-channel references in Faculty source |
| 10 — Act only on confirmed intent | Persona ambiguity detection; proposal flow for irreversibles; Reflex confidence threshold | Resolution Records show confirmation lineage per resolved Arc |
| 11 — No mechanism without constraints | Stage acceptance requires constraints and observability shipped in same stage | Falsification conditions list; stage gate review |
| 12 — Safety not subject to optimization | Compiled safety floor; Optimization Pass cannot write to risk classification | Threshold-change audit log; safety floor breach is a Stage 4 falsification |

---

## Architecture

### PRIME Directives — Above the System

Three to four short rules every Faculty and every LLM call must abide by unconditionally. The only rules in CARL that nothing in CARL can override. In production: compiled into the Nervous System binary. In the TypeScript prototype: loaded from `workspace/PRIME.md` once at boot; runtime halts if missing.

```markdown
# PRIME DIRECTIVES
1. Never act against the operator's interests.
2. Always be transparent about what you are and what you are doing.
3. Never take irreversible action without explicit operator confirmation.
4. Never expose the operator's private data to unauthorized sources.
```

---

### Nervous System

The central hub. Every Faculty connects through the Synapse, never directly. No model runs inside the Nervous System — it routes, validates, and carries. It never reasons. In production, the Nervous System and Immune System are compiled together as a single Zig binary with Prime Directives compiled in and in-process typed channels.

**Immune System** — surrounds and gates all traffic. Pure compiled logic, no LLM. Origin chain validation on every request. Faculty access control via registered permission registry. Behavioral write restriction — external Faculties write facts, never behavior. Circuit breaker isolates anomalous Faculties; Monitor notified; operator authorizes reconnection. Immutable audit log written directly, bypassing the bus.

**Relay** — translates LLM text output into typed objects via Zod (prototype) / Zig comptime types (production). Any payload failing schema is rejected before entering the bus.

**Reflex** — cached policy execution. No model. No inference. Reads Crystallized Memory. Executes Faculty sequences that Cortex previously authorized — it does not author routes. Initializes empty — no-op without Memory Faculty. Reflex is a fast path, never a blind path.

Every Reflex hit passes mandatory checks before dispatch: Faculty health registry check, permission validation against origin stamp, confidence threshold check (HIGH or LOCKED required), risk check (HIGH/CRITICAL always bypass Reflex). Any check failure degrades to Cortex fallback with a REFLEX_DEGRADED signal.

Required Reflex properties: decay without reinforcement (configurable per domain, LOCKED exempt), confidence states (UNSET → LOW → HIGH → LOCKED, where LOW/UNSET always re-validate), operator override (forces Cortex path, always honored), automatic Cortex fallback on low confidence / stale pattern / HIGH-CRITICAL risk / unhealthy Faculty.

**Reflex poisoning mitigations:** accumulation rate anomaly (velocity exceeding N/hour holds pattern PROVISIONAL, requires operator approval), origin diversity requirement (minimum M distinct origins before HIGH, single-origin poisoning structurally impossible), semantic distance check (large route delta at crystallization requires operator confirmation), immutable crystallization log (full observation trail preserved before collapse).

**Dark Lane** — model-invisible data path alongside the reasoning path. Payload routed through it is never seen by any model. Cortex receives metadata only. See [Dark Transit](#dark-transit) for full specification.

---

### Cortex

The single persistent cognitive entity in CARL — not a Faculty. Continuously running, multitasking across N simultaneous Reasoning Arcs, never blocked waiting for any single result. In production, a separate compiled Zig binary with one controlled typed boundary to the Nervous System. Soft surfaces (PERSONA.md, PROTOCOL.md, model assignments) remain configurable without recompilation.

```
CORTEX

PERSONA — main loop, always running
  ├── Arc Store access         ← all active Arcs held in awareness
  ├── Identity context         ← PERSONA.md tints all decisions
  ├── Arc router / Ambiguity check / Compression / Priority manager / Output composer
  └── spawns / manages ↓

REASONING ENGINE — subordinate loop, one per Arc requiring it
  ├── Gating model             ← cheap, decides: Execution or Reasoning Faculty? Plan ready?
  ├── calls Execution Faculty  ← cheap, bounded steps, via Synapse
  ├── calls Reasoning Faculty  ← expensive, deep steps, via Synapse
  ├── calls Memory Faculty     ← context gathering, via Synapse
  └── reports Execution Plan to Persona when ready

DECOMPOSER — receives Execution Plan, dispatches Faculty sequence through Synapse
RESULT BUFFER — per Arc, collects async Faculty results, non-blocking
SYNTHESIS GATE — per Arc, notifies Persona when Arc ready for synthesis
```

---

### Persona — The Main Loop

The continuously running cognitive center that holds all active Reasoning Arcs in awareness simultaneously and tints every decision with the identity defined in PERSONA.md.

**Persona influences presentation and interaction, never system behavior.** Allowed: output framing (tone, format, verbosity), ambiguity resolution (which wildcard interpretation to propose), Arc prioritization, operator interaction tone. Forbidden (enforced by architecture, not convention): Execution Plan content, Reflex routing, security decisions, confidence thresholds, threshold tuning. Persona does not have access to Reflex internals or Immune System state.

**The loop costs nothing at rest.** No model invoked per cycle — pure logic reads of Arc states, new input, Faculty results. A model is invoked only when a specific Arc step requires it. Ten suspended Arcs cycle indefinitely at zero cost.

```
PERSONA CYCLE — zero token cost

  await next event          ← sleeping, zero cost
       ↓
  EVENT ARRIVES: new_input | faculty_result | arc_timeout | optimize_trigger
       ↓
  handle event → update Arc state → dispatch if needed (model only here)
       ↓
  await next event
```

Persona subscribes to the Nervous System. Sensory Faculties publish to the Nervous System. Persona never subscribes to a Faculty directly — Law 2 holds.

**Ambiguity detection:**

```
UNAMBIGUOUS — "Show me my calendar for tomorrow"
  Silent compression:
  { action: CHECK, domain: CALENDAR, scope: TEMPORAL,
    subject: SELF, params: { time_ref: "tomorrow" } }
  → Reflex check. No question asked.

AMBIGUOUS — "Show me what's for tomorrow"
  Partial compression:
  { action: CHECK, domain: *, scope: TEMPORAL,
    subject: SELF, params: { time_ref: "tomorrow" } }
  domain is wildcard — Persona reflects back:
  "So if I understand correctly, you want to check
   your calendar for tomorrow — not weather or tasks?"
  → Operator confirms → wildcard filled → Memory records observation
```

Only wildcard fields trigger re-validation. Every confirmation feeds the Reflex corpus.

---

### Boot Protocol

CARL boots knowing who it is and what is pending. Everything else arrives on demand, triggered by signal.

**Loads at boot (always, small):** PRIME directives (compiled in production), PERSONA.md (~10 lines), PROTOCOL.md (~10 lines), Active Arc index (open Arc IDs + status + one-line summary only — not Arc contents).

**Fetched on demand by Memory Faculty:** Arc full context, Reflex table, Crystallized Memory, Resolution Records, Archived Arcs.

```
SIGNAL ARRIVES → ARC INDEX HIT → MEMORY FACULTY FETCH → PERSONA ACTIVE → ARC RESOLVED → PERSONA SLEEPS
```

Context is a working surface, not a storage space. It assembles when needed and clears when done. A CARL instance running for a year does not have a heavier boot than one started yesterday. Boot is not a cold start — it is a fast resume. Every resolved Arc, crystallized pattern, and confidence score survives restart.

---

### Compressed Intent — Payload Structure

What Reflex matches on and what Cortex reasons from. Origin stamp travels separately.

```
COMPRESSED INTENT RECORD
{
  action:      CHECK | FETCH | WRITE | DELETE | SCHEDULE | SUMMARIZE | MONITOR | DRAFT | SEARCH | BUILD | ...
  domain:      WEATHER | CALENDAR | EMAIL | FILE | WEB | CODE | MEMORY | SYSTEM | ...
  subject:     SELF | OTHER | EXTERNAL
  scope:       TEMPORAL | SPATIAL | TOPICAL | null
  risk:        LOW | ELEVATED | HIGH | CRITICAL         ← set by Immune System, not model
  param_class: { quantifier, modifier, target_breadth }  ← normalized high-impact modifiers — Reflex-matched
  params:      { time_ref, location, filter, ... }       ← variable instances — Reflex never sees them
}
```

Domain is a semantic classifier, not a Faculty map. Multiple Faculties can serve the same domain. Reflex maps the full signature `{ action + domain + subject + scope + param_class }` to a Faculty sequence. Params carry variable instances — Reflex never sees them.

**Param classes prevent semantic collision.** Param values vary infinitely; param *classes* normalize the variance into Reflex-relevant categories. `quantifier` distinguishes `{one, some, all}` — "delete my email" vs "delete all my emails" produce different param_class signatures and therefore different Reflex keys. `modifier` flags qualifying constraints — "draft a reply" vs "draft a legal-safe reply" diverge on modifier presence. `target_breadth` distinguishes `{specific, filtered, unbounded}` — "show me weather tomorrow" vs "show me severe weather alerts tomorrow" diverge on breadth. Param class extraction is a Persona compression responsibility, validated against intent class declarations.

**Param-sensitive intent classes forbid Reflex entirely.** Some intent shapes carry meaning predominantly in their params — Reflex matching on signature alone produces false equivalence regardless of param_class granularity. Intent classes registered as `param_sensitive: true` always bypass Reflex and route to Cortex. Examples: any DELETE with non-`specific` target_breadth, any WRITE to external recipients, any SCHEDULE involving multiple parties. The `param_sensitive` flag is a compiled Immune System property — Optimization Pass cannot lower it.

---

### Reasoning Engine — Subordinate Loop

Spawned by Persona per Arc. Reports Execution Plan back when ready. All Faculty calls through Synapse, all results Relay-validated.

Gating model (cheap, every iteration) decides tier — Execution Faculty (cheap, bounded) or Reasoning Faculty (expensive, deep). A simple problem resolves in one iteration at near-zero cost.

**Hard gating constraints (not learned, not tunable):** certain domains always require Reasoning Faculty (SYSTEM domain, structural changes, multi-step irreversibles), certain actions never escalate beyond Execution (READ-ONLY on SELF with no side effects), max escalation depth declared in Arc budget at open time.

**Arc budget — mandatory invariant:** every Arc declares `max_model_calls`, `max_faculty_dispatches`, `max_wall_time`, and `resource_claims` at open time. Budget exhausted → Arc suspends immediately, Persona notifies operator. No silent continuation. Operator must explicitly authorize continuation or resolution.

**Resource arbitration — multi-Arc contention semantics.** Concurrent Arcs sharing external resources require explicit arbitration. Arc isolation prevents context bleed; it does not prevent write conflicts on shared external state.

Every Arc declares `resource_claims` at open time — the set of external resources it intends to read or modify (e.g., `calendar:operator_main`, `file:/path/to/x`, `email_thread:abc123`, `memory:fact:project_status`). The Immune System maintains a per-resource lock registry. Lock semantics:

- **Read claim** — multiple concurrent reads permitted. No conflict.
- **Write claim** — exclusive. A second Arc requesting write claim on a held resource enters CONTESTED state.
- **Read-then-write claim** — escalates from read to write at modification point. Conflict detected at escalation.

```
CONTESTED ARC RESOLUTION
  CONTESTED Arc → suspended immediately, Persona notified
  Persona presents conflict to operator with both Arc summaries
  Operator decides:
    SERIALIZE  → second Arc waits for first to resolve, then proceeds
    CANCEL     → second Arc dropped, first proceeds unchanged
    MERGE      → both Arcs collapsed into a single Arc with combined intent
                 (operator must confirm merged intent before execution)
    OVERRIDE   → second Arc proceeds, first Arc rolled back if reversible
                 or suspended for operator review if not
  No silent contention resolution — operator authority required for all four outcomes.
```

**Memory write conflicts** — Tier 1 writes are already serialized through a single write queue per Memory Faculty. Cross-Arc memory updates with conflicting values on the same key trigger CONTESTED resolution as above. Last-write-wins is forbidden for shared keys.

**Optimistic concurrency for low-risk reads** — read claims do not lock; reads complete immediately. If a write claim arrives while a read-claim Arc is mid-execution and the read is from a key the writer modifies, the reader receives a STALE_READ signal and Persona decides whether to re-read or surface the inconsistency to the operator.

```
ARC LIFECYCLE:  open (with budget + resource_claims) → active → [contested?] → suspended → resolved
```

---

### Memory Faculty

All persistence. The substrate that makes Reflex possible.

| Tier | Contents | Properties |
|---|---|---|
| 0 | Prime Directives | Compiled in production — file at build time only |
| 1 | Dynamic runtime — facts, session context, Arc state | Write-serialized, concurrent reads, Arc contexts isolated |
| 1a | Observation Log — immutable append-only record of every raw observation | Durable, never collapsed, never overwritten, append-only audit trail |
| 1b | Short Term Memory — wildcard observations per origin (working representation) | Hash table, O(1), volatile (lost on restart), bounded max N before forced collapse |
| 1c | Crystallized Memory — collapsed beliefs, Reflex corpus, Resolution Records, archived Arcs, Arc index | K/V store, durable, survives restart (LevelDB/SQLite → abstracted K/V) |
| 2 | Configuration — routing rules, Faculty registry, tuned thresholds | Optimization Pass writes with Cortex authorization |
| 3 | Identity — PERSONA.md, PROTOCOL.md | Operator only, via authenticated channel |

**Crystallization — collapse the working representation, preserve the evidence.** Each ambiguous confirmation produces *two* writes simultaneously: an entry in Tier 1b Short Term (working representation, volatile, used for fast threshold detection) and an entry in Tier 1a Observation Log (durable, immutable, append-only). Threshold reached → Tier 1b entries discarded, Tier 1c crystallized belief written with weight and confidence. **Tier 1a is never touched.**

```
ON AMBIGUOUS CONFIRMATION
  Tier 1b ← observation (volatile, working, O(1) hash entry)
  Tier 1a ← observation record (durable, immutable, append-only)
            { ts, origin_hash, wildcard, resolved_to, intent_signature, prompt_phrasing_hash }

ON CRYSTALLIZATION THRESHOLD
  Tier 1b entries → discarded (working representation collapsed)
  Tier 1c ← { pattern, weight, confidence, observation_count, source_diversity }
  Tier 1a → untouched, full evidence preserved

ON SUSPECTED POISONING OR INCORRECT BELIEF
  Tier 1c entry quarantined or demoted
  Tier 1a queried for full provenance:
    distribution shape across origins
    correction chronology
    source clustering
    prompt phrasing patterns (jailbreak detection)
  Forensic reconstruction → operator decides quarantine, demotion, or correction
```

**Why two tiers.** Tier 1b is for *speed* — O(1) hash table for crystallization threshold detection at hot-path latency. Tier 1a is for *truth* — durable evidence that survives crystallization, restart, and any number of belief revisions. Collapsing the working representation does not destroy the evidence that produced it.

**Tier 1a properties:**
- Append-only — no entry is ever modified or deleted
- Immutable hash chain — each entry includes hash of previous entry, tamper-evident
- Operator-readable, Faculty-readable for forensics, Cortex never writes directly
- Bounded by retention policy, not by working-set size — old entries archive to cold storage but are not lost
- Used by Reflex poisoning mitigations (semantic distance check, source diversity verification) at crystallization time

**Confidence states:** `UNSET → LOW → HIGH → LOCKED`. `PROVISIONAL` when ceiling hit before threshold. Ambiguous patterns tracked per origin stamp — trust is not transferable.

**Semantic Index — vector retrieval interface across Tier 1a and Tier 1c.** A vector store sits alongside the K/V tiers and indexes their content. It is not a tier — it is a query interface that returns ranked references for the caller to fetch from K/V. The K/V store remains source of truth; the Semantic Index carries embeddings and reference keys only.

```
SEMANTIC INDEX

  Indexes:    Tier 1a (Observation Log), Tier 1c (Crystallized, archived Arcs)
  Stores:     embedding vector + reference key only — no content
  Returns:    ranked list of reference keys with similarity scores
  Source of truth: K/V store always — vector index cannot drift independently

  Write trigger:  any write to indexed tier → embedding regenerated → vector updated
  Delete trigger: K/V deletion → vector removed
  Embedding model: declared in AGENTS.md, operator-modifiable, swappable
```

**Five constraints — keep semantic retrieval honest:**

1. **Index only, never duplicate.** Vector store carries embeddings and keys; K/V store carries content. A vector hit returns a reference; the caller must K/V-fetch to read. No content drift possible because no content is stored twice.

2. **Read-only from Reflex — compiled boundary.** The Reflex hit path cannot query the Semantic Index. Reflex matches on discrete signature equality only. Vector queries require explicit caller authorization (Cortex Reasoning Engine, Persona during ambiguity flow, Optimization Pass diagnostics, operator-initiated retrieval). This is not a convention — Reflex's call surface to Memory Faculty does not include the vector query interface.

3. **Embedding generation is internal to Memory Faculty.** Runs inside Memory Faculty's bounded execution context, on writes, before commit. No Synapse traffic for embedding generation. No separate Embedding Faculty — that would create a second autonomous model invocation point on the hot write path.

4. **Vector queries are auditable.** Every query logs `{caller, query_text_hash, returned_keys, similarity_scores, timestamp}` to Tier 1a. Forensic reconstruction of "why did Cortex retrieve these Arcs as context for this Arc" must be possible from logs alone.

5. **Similarity is never a decision.** The Semantic Index returns ranked references; the caller decides what to do with them. Reflex makes routing decisions on discrete signatures. Cortex makes reasoning decisions over assembled context. Operator makes intent decisions in the ambiguity flow. The vector store is not authorized to make any of these decisions — it answers "give me relevant context," never "should I act."

**Why this addition is structurally safe.** RAG is honest when it answers *"give me relevant context."* RAG is dangerous when it answers *"should I act?"* The first leaves the decision with a decision-maker (Cortex, operator, Persona). The second moves the decision into a vector space where it cannot be audited, cannot fall back gracefully, and cannot be falsified at low cost. The Semantic Index is restricted to the first.

**Crystallization-time use — secondary benefit.** At crystallization time, Memory Faculty runs a vector check: *"Is this candidate pattern semantically near an existing crystallized pattern that the K/V exact-match check missed?"* Three outcomes:
- No vector hit → write new entry
- Near-duplicate signature with different `param_class` → flag for operator review (potential redundancy or genuine distinction)
- Strong vector match with semantic distance flagged → operator confirmation required (anti-poisoning, complements the existing semantic distance check)

The crystallization decision remains with operator and existing Reflex poisoning mitigations. The vector check just makes the question visible.

**Stage gating.** The Semantic Index ships in Stage 2.5 or Stage 3, not Stage 2. Stage 2 must first prove the K/V crystallization loop is empirically stable (per Patch 9 adversarial validation requirement). Vector retrieval is an enhancement, not a foundation.

---

### Optimization Pass

Threshold tuning sweep — another Arc to Persona. Minimizes cost subject to safety floor.

After every resolved request, a Resolution Record is written: `{ intent_signature, path_taken, faculty_sequence, cost, duration, result_quality, thresholds_used }`.

**Tunable thresholds (within safety floor):** Reflex confidence ceiling, Gating model escalation trigger, Result Buffer completeness window, Decomposer step count ceiling.

**Safety floor (compiled, not tunable):** risk classification is Immune System property, HIGH/CRITICAL always bypass Reflex, constitutional threshold ceiling cannot drop below operator floor, escalation for HIGH/CRITICAL is fixed at ALWAYS.

**Quality signal policy:** Stages 2–3 use cost and duration only. Stage 4+ requires operator-defined quality rubric (explicit, versioned, Tier 2). No rubric → quality dimension disabled. Behavior proxies never used as quality ground truth.

**Triggers:** operator command, scheduled (every N resolved requests), automatic (cost spike or correction rate spike detected).

**Authority:** threshold-only within safety floor → Cortex authorized. Approaches safety floor → operator required. Safety floor itself → compiled, operator must rebuild.

**The cost funnel at maturity:**

```
ALL REQUESTS
├── REFLEX              zero model cost        → majority
├── SIMPLE PATH         cheap model            → common
├── COMPLEX → SIMPLE    expensive + cheap      → rare
└── COMPLEX → SYNTHESIS most expensive         → exceptional
```

---

### Faculties

Every capability follows the same pattern. Subscribe through Synapse. Execute. Publish through Synapse. A Faculty needs: a model capable of bounded execution, Synapse compliance, and a safety/fault validation layer that rejects non-conforming output before it returns to Cortex. Faculties do not communicate with each other — ever. Isolation is total and structural.

Faculties are TypeScript. Hot-reloadable. Always.

**Categories:**

- **Sensory** — receive external input, stamp origin, publish to Nervous System (Telegram, Discord, etc.)
- **Execution** — act on the world within defined scope (Gmail, Calendar, Web)
- **Infrastructure** — maintain the system (Memory, Jobs, Monitor)

The Coding Faculty is *not* listed under Infrastructure. It is structurally distinct — see [System Evolution Boundary](#system-evolution-boundary) below. Treating it as a Faculty is a category error: a component that can read source, write source, propose new Faculties, affect routing, and hot-reload operational code is a controlled compiler-and-deployment pipeline expressible through the Faculty contract — not a Faculty in the same trust class as Gmail or Calendar.

**Faculty Contract — minimum interface, no exceptions:**

```typescript
interface Faculty {
  readonly id:          FacultyId
  readonly version:     string
  readonly permissions: Permission[]
  register(synapse: Synapse): Promise<void>
  teardown(): Promise<void>
}
```

---

### System Evolution Boundary

The Coding Faculty is the only component in CARL that can modify CARL itself. That capability puts it in its own trust tier — above Execution Faculties, below Cortex, governed by a separate lifecycle and a separate threat model. The naming reflects function: this is not a Faculty, it is the boundary across which the system evolves.

**What the System Evolution Boundary can do:**
- Read existing source for any Faculty
- Write candidate source for new Faculties
- Propose modifications to existing Faculties
- Trigger hot-reload of approved code
- Read and propose modifications to Tier 2 configuration (routing rules, model assignments, AGENTS.md, SCHEMA.md)

**What it cannot do — compiled boundaries:**
- Modify the Nervous System, Immune System, or Synapse (compiled in production; in prototype, writes to those paths are statically rejected at validation)
- Modify Cortex internals (Persona, Reasoning Engine, Decomposer, Result Buffer, Synthesis Gate)
- Modify PRIME.md (compiled in production; chmod 444 in prototype with halt-on-write)
- Modify PERSONA.md or PROTOCOL.md (Tier 3, operator-only)
- Modify its own validation pipeline (would constitute writing the rules it answers to)
- Self-promote without operator approval (no operator override path exists for this)

**Mandatory promotion lifecycle — no exceptions, no shortcuts:**

```
1. Generate                Candidate code produced
2. Validate                Static analysis:
                             schema compliance check
                             Synapse-only access pattern
                             no mutable global state
                             no writes to nervous-system/ immune-system/ synapse/ cortex/
                             no modifications to validation pipeline itself
3. Capability diff         Compare candidate's declared permissions against:
                             closest existing Faculty (delta inspection)
                             declared permission envelope for this Faculty class
                             undeclared capability → automatic rejection, no override
4. Dependency audit        Full transitive dependency tree reviewed:
                             every direct and indirect import enumerated
                             license compatibility check
                             known-vulnerability scan against current CVE database
                             new dependency → flagged for operator review
5. Resource ceiling        Declared at registration, enforced at runtime:
                             max CPU, memory, file handles, network connections
                             no declaration → rejected
                             runtime violation → circuit breaker
6. Outbound network policy External destinations enumerated and operator-whitelisted:
                             undeclared destination at runtime → blocked
                             policy stored in Tier 2, operator-modifiable only
7. Sandbox                 Isolated environment for execution test:
                             filesystem restricted to declared paths
                             network restricted to declared destinations
                             any violation → immediate rejection
8. Reproducible build      Binary hash must match deterministic rebuild from declared source:
                             non-reproducible → rejected (supply-chain integrity)
                             attestation logged in immutable audit trail
9. State migration proof   If candidate modifies state schema:
                             forward migration provided
                             reverse migration provided
                             automated equivalence test on both directions
                             non-reversible migration → operator confirmation required
10. Quarantine             Non-executing observation for N cycles
11. Operator approval      Required, always, no exceptions, no override path
12. Staged canary          1% traffic; error rate monitored against baseline
                             clean window required for full promotion
13. Rollback proof         Error rate spike → automatic rollback to previous version
                             re-promotion requires operator action
```

**Threat model — what the lifecycle defends against:**

| Attack Surface | Defense |
|---|---|
| Malicious generated code | Static validation (step 2) + sandbox (step 7) + operator approval (step 11) |
| Capability creep (Faculty asks for more than it needs) | Capability diff (step 3) — undeclared capability is automatic rejection |
| Supply-chain compromise via dependency | Dependency audit (step 4) + reproducible build (step 8) |
| Resource exhaustion attack | Resource ceiling (step 5) + circuit breaker on violation |
| Data exfiltration via new outbound channel | Outbound network policy (step 6) — undeclared destination blocked |
| Schema migration corruption | State migration proof (step 9) — forward and reverse must pass equivalence |
| Bad-canary in production | Staged canary (step 12) + automatic rollback (step 13) |
| Self-modification of safeguards | Validation pipeline modifications statically rejected (step 2) |

**Why this is a separate trust tier.** Every other Faculty operates on the world. The System Evolution Boundary operates on CARL. A bug in Gmail Faculty mishandles email. A bug in the System Evolution Boundary mishandles the architecture. The blast radius is structurally different. The trust class follows the blast radius, not the implementation language.

Autonomous modification of existing Faculties without operator approval is forbidden under all circumstances. This is a compiled invariant, not a configuration setting.

---

### Dark Transit

Content can move through CARL without entering any model context. The Dark Lane is the Nervous System mechanism.

**Blind Fetch** — outbound. Faculty fetches content, routes through Dark Lane. Cortex receives `{ type: FILE, status: DARK_LANE }` only. Can only be initiated for operator-requested content traceable to an authenticated origin.

**Blind Write** — inbound. Operator provides secret or token. Dark Lane carries to target. Written without any model reading it.

**Inert by Default** — cold content cannot self-activate. A prompt injection in a cold file never reaches model context.

**Content trust states:** `COLD → ELEVATED → ACTIVE`

**Cold-to-active elevation protocol:** operator issues elevation instruction (origin validated by Immune System) → MIME inspection → size check → malware scan (if configured) → policy scan (forbidden pattern list) → partial read / structural scan options → all gates pass → COLD → ELEVATED → logged in immutable audit trail with origin stamp.

**Exfiltration mitigations (structural):** destination whitelist per darkLane() call (no runtime self-addition), direction enforcement (Blind Fetch: external→internal only; Blind Write: operator→internal only; cross-Faculty Dark Lane requires explicit operator authorization), volume anomaly detection (trips circuit breaker), source restriction (Blind Fetch requires validated operator request — no autonomous Faculty-initiated Blind Fetch).

---

### Synapse

Typed abstraction layer between Faculty code and the Nervous System. Law 9 made concrete. In prototype wraps EventEmitter. In production wraps the compiled boundary. Faculty code never changes when transport changes.

```typescript
interface Synapse {
  publish<T extends CarlEvent>(event: T): Promise<void>
  subscribe<T extends CarlEvent>(eventType: T['type'], handler: (event: T) => Promise<void>): void
  darkLane(payload: Buffer, destination: FacultyId): Promise<void>
}
```

**Observability — built at Stage 0.** Every Synapse call emits a structured trace event to a separate append-only log. Content never logged — schema hash only. Supports deterministic event replay, redacted payload sampling (operator opt-in), and per-Arc execution timeline reconstruction.

```typescript
interface TraceEvent {
  ts: number; faculty_id: FacultyId;
  event_type: 'PUBLISH' | 'SUBSCRIBE' | 'REFLEX_HIT' | 'REFLEX_MISS'
    | 'REFLEX_DEGRADED' | 'ARC_OPEN' | 'ARC_SUSPENDED' | 'ARC_RESOLVED' | 'BUDGET_EXHAUSTED';
  schema_hash: string; arc_id: ArcId | null; origin_hash: string;
  tier: 'REFLEX' | 'EXECUTION' | 'REASONING' | null;
  budget_state: { calls_remaining: number; dispatches_remaining: number; time_remaining_ms: number } | null;
}
```

---

## Build Stages

Five stages. Each proves exactly one theoretical claim. **Minimum Viable Carl = Stages 0 + 1 + 2.** Stages 3–5 extend beyond MVC.

---

### Stage 0 — The Spine
*Claim: interface discipline, typed routing, event-driven coordination, and authority propagation hold under load with zero direct bus access.*

**Scope of claim — explicit limits.** Stage 0 proves the spine works:
- Interface discipline — no Faculty bypasses Synapse
- Typed routing — no untyped payload reaches the bus
- Authority propagation — origin stamp validated at every hop
- Event-driven coordination — Persona consumes zero tokens at rest
- Audit completeness — every Arc is reconstructable from trace logs alone

**Stage 0 does NOT prove:**
- Structural security broadly (policy bugs, schema confusion, authority propagation bugs at scale, supply-chain compromise are all out of scope)
- Resilience against compromised Faculty logic
- Correctness of risk classification
- Soundness of Coding Faculty (deferred to Stage 3)
- Production-grade fault tolerance

Stage 0 proves the architecture *runs* with the right shape. Broader security claims require later stages plus operational hardening.

**Stack:** TypeScript + Bun.

**Built (real from day one):** PRIME.md (loaded at boot, chmod 444, halts if missing), Synapse (EventEmitter wrapper), Nervous System (typed bus + Relay with Zod), Immune System (origin validation, permission registry, audit log), Faculty health registry (heartbeat tracking), trace logging (append-only, per-Arc reconstruction), Arc budgets (declared at open, enforced), Persona (async event loop, Arc Store as Map, zero tokens per cycle), Telegram Sensory Faculty (Grammy), one stub Execution Faculty.

**Hardcoded:** Reasoning Engine returns static Execution Plan, Execution Faculty returns static result, Reflex empty, no ambiguity detection.

**Proof of life:** Operator → Telegram → Synapse → Immune System validates → Persona wakes → Arc opens with budget → Reflex misses → hardcoded plan → stub Faculty → Result Buffer → Synthesis Gate → Persona delivers → Arc resolved. Verify: no direct bus access, no untyped payload on bus, zero tokens during wait, PRIME.md untouched, trace log reconstructable, budget tracked, health registry accurate.

**Falsification:** any Faculty published directly to bus without Synapse, any untyped payload reached bus, or PRIME.md was written to during run.

---

### Stage 1 — Confirmed Intent
*Claim: detect lexical and single-wildcard ambiguity, reflect it back precisely, earn the right to act — never assume on this class.*

**Scope of claim — explicit limits.** Stage 1 proves *basic* ambiguity reflection only:
- Single wildcard field in compressed intent (e.g., domain unresolved)
- Lexical ambiguity (referent unclear at the word level)
- Irreversibility detection on declared-irreversible action classes

**Out of scope for Stage 1 — deferred or unaddressed:**
- Discourse-level ambiguity (referent depends on prior Arc context)
- Pragmatic ambiguity ("clean this up and send it" — object, scope, destination, approval requirement all underspecified)
- Multi-wildcard ambiguity (more than one field unresolved simultaneously)
- Latent irreversibility (action looks reversible but has irreversible side effects)
- Conflicting constraint detection across multiple operator inputs

These remain open problems. Stage 1 does not solve general intent certainty — it solves the narrow case of single-wildcard lexical ambiguity with a structured re-validation flow.

**Added:** Persona basic ambiguity detection, partial compression with single wildcard, re-validation rephrasing, proposal flow for declared-irreversible operations, first real model call (Execution Faculty, cheap model).

**Proof of life:** Unambiguous input → silent compression, Faculty dispatched. Single-wildcard ambiguous input → Persona reflects back, operator confirms, then dispatched. Declared-irreversible → proposal flow, operator confirms or cancels.

**Falsification:** single-wildcard ambiguous input triggered Faculty dispatch without confirmation, or declared-irreversible action executed without proposal flow. Out-of-scope ambiguity classes (discourse, pragmatic, multi-wildcard) are not falsification conditions for Stage 1 — they are acknowledged gaps.

---

### Stage 2 — The Learning Loop
*Claim: route caching with safety properties — cheaper at runtime, with poisoning resistance and decay, derived from operator-confirmed resolutions.*

**Scope of claim — explicit limits.** Stage 2 proves bounded local policy caching:
- Crystallized routes derive from operator-confirmed resolutions only
- Reflex hit path enforces health, permission, confidence, and risk checks
- Decay returns stale patterns to Cortex
- Identity-scoped confidence prevents cross-operator trust transfer
- LLM call count measurably drops on repeated matching intents

**Stage 2 is NOT:** broad learning, concept formation, abstraction, transfer, or anything a research paper would call "learning" in the cognitive sense. It is discrete route caching with safety properties.

**Added:** Memory Faculty (Tier 1a Observation Log + Tier 1b Short Term + Tier 1c Crystallized), observation accumulation with dual-write to 1a and 1b, crystallization on threshold, Reflex corpus from crystallized entries, Reflex routing active, identity-scoped confidence, all Reflex safety constraints (health check, permission validation, confidence check, decay, operator override, risk-based fallback), instrumentation (crystallization events, Reflex hit outcomes, cost per request).

**Proof of life:** Repeated ambiguous confirmations → observations accumulate (Tier 1b working, Tier 1a immutable) → threshold → crystallization fires → Reflex entry written → next matching request: health ✓, permission ✓, confidence HIGH ✓ → Faculty dispatched directly, zero LLM calls. Measurable from instrumentation: LLM call count drops post-crystallization.

**Empirical validation requirement — Stage 2 is "designed safe" until adversarial corpus passes; "empirically safe" only after.** Design correctness is necessary but not sufficient. The Reflex matching surface is the most likely failure surface in CARL — semantic drift across near-equivalent intents, adversarial phrasing at the classification boundary, and long-tail ambiguity not captured by `param_class` are all real risks even after the Patch 4 collision safeguards. Required before declaring Stage 2 empirically proven:

- Adversarial test corpus targeting Reflex classification boundary (operator-curated intent pairs that *should* and *should not* collide on signature)
- Mutation-based fuzzing of intent phrasing within and across declared param_class boundaries
- False equivalence rate tracked as a first-class metric, surfaced in instrumentation alongside Reflex hit rate
- Poisoning campaign simulation: single-origin spam, distributed origin coordination, gradual confidence climbing — verify Reflex poisoning mitigations (rate anomaly, origin diversity, semantic distance, immutable log) trip before HIGH confidence is reached

**Falsification:** semantically distinct requests collapse to same route without correction mechanism, adversarial phrasing poisons Reflex without anomaly detection, HIGH confidence error rate exceeds Cortex path error rate, false equivalence rate is not measured, or any poisoning campaign reaches HIGH confidence undetected.

---

### Stage 3 — Continuous Entity
*Claim: continuously running cognitive entity managing multiple simultaneous Arcs.*

**Added:** True concurrent Arc processing, non-blocking Arc management, suspension/resumption, results delivered as ready.

**Proof of life:** Long-running Arc A + quick Arc B sent immediately after. Arc B resolves first, delivered immediately. Arc A unaffected, resolves independently.

**Falsification:** Arc B blocked on Arc A, Arc contexts shared state, or results delivered in request order.

---

### Stage 4 — Self-Optimization
*Claim: tune a defined set of cost-performance thresholds within a compiled safety floor, driven by Resolution Records.*

**Scope of claim — explicit limits.** Stage 4 proves bounded threshold tuning:
- Four declared thresholds adjustable (Reflex confidence ceiling, Gating escalation trigger, Result Buffer window, Decomposer step ceiling)
- Adjustments derived from Resolution Records, not from operator-free heuristics
- Safety floor is a compiled invariant — never crossed regardless of cost pressure
- Quality ground truth must be operator-defined before quality signal is used (no behavior proxies)

**Stage 4 does NOT prove:**
- Self-improvement broadly (no new procedures learned, no new abstractions formed, no new concepts acquired)
- Robustness against proxy failure if quality rubric is poorly specified — that is an operator responsibility
- Generalization across operators or deployment contexts — tuning is per-instance
- Drift detection over arbitrary time horizons — requires red-team sampling outside Stage 4 scope

This is bounded threshold tuning. It is not learning in the broad cognitive sense — it is policy parameter optimization within a fixed envelope.

**Added:** Resolution Records, Optimization Pass (threshold sweep as Arc), automatic triggers, Tier 2 threshold updates.

**Proof of life:** Baseline cost distribution measured → 100 varied interactions → Optimization Pass triggered → thresholds adjusted within safety floor → measurable cost reduction (higher Reflex %, lower Complex %) with no safety floor breach and no quality regression on operator-defined rubric.

**Longitudinal observability requirement — Stage 4 is "bounded by design" always; "observed stable" only after longitudinal sampling confirms no drift.** The safety floor prevents catastrophic regression. It does not prevent gradual degradation within allowed bounds — outputs that remain technically correct while becoming progressively shallower, under-escalation that still passes the quality floor on a per-request basis but trends downward over weeks, confirmation loops that preserve low-cost behavior at the expense of depth. This is standard proxy failure; it is invisible at the request level and only visible across time. Required before declaring Stage 4 empirically stable:

- Longitudinal quality drift metric: rolling-window quality measurement on a held-out intent corpus, sampled at fixed intervals
- Periodic Cortex-vs-Reflex-vs-optimized-path comparison: same intent run through all three paths, output quality compared on operator rubric, divergence trended
- Silent regression detection: alert when held-out corpus quality trends downward over N consecutive sampling windows even while per-request quality floor is met
- Operator drift report: surfaced as a regular Arc, presents drift trend with recommended threshold reset if regression detected

**Falsification:** cost distribution did not shift, safety floor breached, quality ground truth not operator-defined before use, thresholds drifted outside declared adjustable set, longitudinal drift metric not implemented, or held-out quality regression went undetected for more than the alerting window.

---

### Stage 5 — Dark Transit
*Claim: data can move through a cognitive architecture without any model ever reading it.*

**Added:** Dark Lane implementation, Blind Fetch/Write, Inert by Default enforcement, content trust state tracking.

**Proof of life:** Blind Fetch — file fetched through Dark Lane, Cortex receives metadata only, operator receives file, injected prompt injection never reached model context. Blind Write — API key carried to target, audit log confirms key never appeared in any model call.

**Falsification:** cold payload appeared in model context, prompt injection influenced model output, elevation protocol did not fire before model read, or audit log missing elevation event.

---

## Evolution Beyond Stages

- **Phase A — Messaging hardening:** Synapse internals swapped for hardened transport. Zero Faculty changes.
- **Phase B — Zig compilation:** Nervous System + Immune System compiled as one Zig binary. Cortex compiled separately. Prime Directives compiled in. Faculties remain TypeScript forever.
- **Phase C — Full deployment:** All Faculty categories live. Coding Faculty builds autonomously. Optimization Pass on automatic schedule.

```
PHASE B TARGET

  ┌──────────────────────────────────────┐
  │  NERVOUS SYSTEM + IMMUNE  (Zig)      │
  │  Relay · Reflex · Dark Lane          │
  │  PRIME compiled in                   │
  │                                      │
  │  CORTEX  (Zig)                       │
  │  Persona · Arc Store                 │
  │  Reasoning Engine · Decomposer       │
  │  Result Buffer · Synthesis Gate      │
  │                                      │
  │  In-process typed channels           │
  └──────────────┬───────────────────────┘
                 │ ONE typed boundary
  ┌──────────────┴───────────────────────┐
  │  FACULTY RUNTIME  (TypeScript / Bun) │
  │  Hot-reloadable. Always.             │
  └──────────────────────────────────────┘
```

---

## Stack

| Component | Prototype | Production |
|---|---|---|
| Runtime | Bun | Bun (Faculties) + Zig (core) |
| Language | TypeScript | TypeScript (Faculties) + Zig (core) |
| Event bus | Node EventEmitter via Synapse | Compiled typed channels via Synapse |
| Schema validation | Zod | Zig comptime types |
| Short Term Memory (Tier 1b) | In-process hash map | Zig HashMap |
| Observation Log (Tier 1a) | Append-only file with hash chain | Append-only file with hash chain, archive tier |
| Crystallized Memory (Tier 1c) | LevelDB or SQLite | Abstracted K/V interface |
| Semantic Index | Local vector store (e.g. LanceDB, FAISS) indexing Tier 1a + 1c keys | Abstracted vector index interface |
| Embedding model | Local model declared in AGENTS.md (e.g. nomic-embed, BGE) | Same; operator-swappable |
| Telegram | Grammy | Grammy |
| LLM interface | Vercel AI SDK | Vercel AI SDK |
| File watching | Chokidar | Chokidar |

---

## Workspace Seed Files

Seed before first boot. Set read-only: `chmod 444 workspace/PRIME.md`

**PERSONA.md** — Identity, tone, coloring (~10 lines). Operator modifiable at runtime.

**PROTOCOL.md** — Behavioral rules: ambiguity (reflect back, one question), irreversible (propose before executing), research channel (no protocol, full dialogue), Dark Lane delivery (frame before payload), multi-Arc (deliver as ready).

---

## Configuration Files

| File | Purpose | Who can modify | Phase |
|---|---|---|---|
| PRIME.md | Prime Directives | Operator before build only | Build time |
| PERSONA.md | Identity — name, role, tone | Operator via authenticated channel | Runtime |
| PROTOCOL.md | Behavior — rules and output discipline | Operator via authenticated channel | Runtime |
| SCHEMA.md | Relay language — schema definitions | Coding Faculty with operator auth | Runtime |
| AGENTS.md | Faculty registry — routing, model assignments | Coding Faculty with operator auth | Runtime |

---

## Repository Structure

```
carl/
├── nervous-system/
│   └── immune-system/
├── synapse/
├── cortex/
│   ├── persona/
│   │   ├── arc-store/
│   │   ├── ambiguity/
│   │   └── output-composer/
│   ├── reasoning-engine/
│   │   └── gating/
│   ├── decomposer/
│   ├── result-buffer/
│   └── synthesis-gate/
├── faculties/
│   ├── memory/
│   │   ├── observation-log/        ← Tier 1a: append-only, hash-chained
│   │   ├── short-term/             ← Tier 1b: volatile working representation
│   │   ├── crystallized/           ← Tier 1c: durable K/V
│   │   └── semantic-index/         ← vector retrieval interface across 1a + 1c
│   ├── telegram/
│   ├── gmail/
│   ├── calendar/
│   ├── web/
│   ├── jobs/
│   └── monitor/
├── system-evolution-boundary/      ← separate trust tier — NOT under faculties/
│   ├── generator/
│   ├── validator/
│   ├── capability-diff/
│   ├── dependency-audit/
│   ├── sandbox/
│   ├── canary/
│   └── rollback/
├── workspace/
│   ├── PRIME.md
│   ├── PERSONA.md
│   ├── PROTOCOL.md
│   ├── SCHEMA.md
│   └── AGENTS.md
├── examples/
│   └── personas/
└── memory/
```

---

## Naming Reference

| Term | Definition |
|---|---|
| Reasoning Arc | Unit of reasoning — trajectory with declared budget and resource_claims |
| Arc Store | All active Arcs held by Persona — isolated; no cross-Arc context bleed |
| Arc Budget | Mandatory per-Arc resource limit — max_model_calls, max_faculty_dispatches, max_wall_time |
| Resource Claims | Per-Arc declaration of external resources read or written; arbitrated by Immune System lock registry |
| Contested Arc | Arc state when resource conflict detected — operator must resolve via SERIALIZE, CANCEL, MERGE, or OVERRIDE |
| Stale Read | Signal returned to read-claim Arc when a write-claim Arc modifies a key it read |
| Persona | Main loop — event-driven, zero tokens per cycle, presentation/interaction layer only |
| Synapse | Typed abstraction between Faculty code and Nervous System; Faculty-facing API |
| Relay | Text → typed objects, schema validation at bus entry |
| Reflex | Cached policy execution — Cortex-authorized, no re-reasoning, discrete signature match only |
| Param Class | Normalized high-impact modifier categories included in Reflex signature (quantifier, modifier, target_breadth) |
| Param Sensitive | Intent class flag forbidding Reflex match — always routes to Cortex |
| Gating Model | Cheap model inside Reasoning Engine — decides tier within hard constraints |
| Decomposer | Executes Execution Plans via Faculty dispatch |
| Result Buffer | Per-Arc async collection of Faculty results |
| Synthesis Gate | Notifies Persona when Arc ready |
| Resolution Record | Post-resolution metadata — feeds Optimization Pass |
| Optimization Pass | Constrained threshold sweep within safety floor; tunes four named thresholds only |
| Safety Floor | Compiled invariant — cannot be breached by optimization or any runtime authority |
| Dark Lane | Model-invisible data path inside Nervous System; routing constrained by Immune System whitelist |
| Dark Transit | Principle — content moves without entering model context |
| Blind Fetch | Outbound Dark Transit — operator-authorized only, no autonomous Faculty initiation |
| Blind Write | Inbound Dark Transit — secret written, never model-read |
| Inert by Default | Cold content cannot self-activate; elevation requires operator authority |
| Elevation Protocol | Required multi-gate process before cold content enters model context |
| Observation Log (Tier 1a) | Append-only, hash-chained, immutable durable record of every raw observation |
| Short Term Memory (Tier 1b) | Volatile hash table — working representation for crystallization threshold detection |
| Crystallized Memory (Tier 1c) | Durable K/V store — collapsed beliefs, Reflex corpus, archived Arcs |
| Semantic Index | Vector retrieval interface across Tier 1a and 1c; returns ranked references, never decisions; forbidden to Reflex |
| Active Arc Index | Lightweight boot payload — Arc IDs + statuses only, not Arc contents |
| Boot Protocol | Minimal working set assembly — identity always, rest on demand |
| Confidence | Per-origin trust score for ambiguous patterns: UNSET → LOW → HIGH → LOCKED |
| Partial Compression | Ambiguous input compressed with single wildcard field for unresolved domain |
| System Evolution Boundary | The Coding Faculty's correct classification — separate trust tier above Execution Faculties, governed by 13-step promotion lifecycle |
| Capability Diff | Validation step comparing candidate Faculty's declared permissions against permission envelope; undeclared → automatic rejection |
| Reproducible Build | Validation step requiring binary hash to match deterministic rebuild from declared source |
| Staged Canary | 1% traffic promotion for generated Faculties before full deployment |
| Longitudinal Drift Metric | Stage 4 instrumentation requirement — held-out corpus quality trended over time to detect silent regression within safety floor |

---

## Naming

**CARL** — Cognitive Autonomous Recursive Learning.
- *Cognitive* — operates on intent compression, route resolution, and policy caching, organized in roles named after cognitive functions. The name is a navigation aid, not a claim of cognition in any stronger sense than what the architecture demonstrably does.
- *Autonomous* — runs continuously without per-request external trigger, within bounds operator authorized.
- *Recursive* — system-level feedback across multiple loops (route caching, threshold tuning, factual memory, self-extension under operator gate). Not recursive learning of new abstractions.
- *Learning* — bounded local policy caching, threshold tuning, and factual memory updates derived from operator-confirmed resolutions. Not concept formation, not transfer, not abstraction.

---

## Author

Conceived and designed by Samuël Tremblay in April 2026.

**Samuël Tremblay** — Montreal, Quebec, Canada — [github.com/barnacker](https://github.com/barnacker)

---

## Contributing

Contributions welcome under Apache 2.0. Open an issue before significant PRs. Contributors retain copyright; by submitting a PR, contributors grant a perpetual, worldwide, non-exclusive, royalty-free license under Apache 2.0.

---

## License

Copyright 2026 Samuël Tremblay — Licensed under the Apache License, Version 2.0.
http://www.apache.org/licenses/LICENSE-2.0
