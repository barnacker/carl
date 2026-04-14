# CARL — Cognitive Autonomous Recursive Learning

CARL is a framework for building systems that reason independently, self-protect by design, and grow more capable the longer they run — by converting experience into reflex, chaining Faculties recursively to resolve complex problems, and feeding every resolved request back into a loop that makes the next response faster, cheaper, and more precise.

CARL is not an agent framework.  
CARL is not a chatbot platform.  
CARL is not an automation tool.

CARL is a synthetic cognitive architecture. Every component maps to a functional analog in biological cognition. The result is a system that thinks, protects itself structurally, and improves the longer it runs — booting the way a human does: knowing who it is and what matters, retrieving everything else on demand, as fast as reflex.

---

## Why CARL Exists

The agent paradigm made AI automation accessible. It is also fundamentally limited. Agents conflate reasoning and execution. That conflation is where security breaks down, costs compound, and systems become unpredictable.

CARL eliminates the agent concept entirely.

| Dimension | Agent Frameworks | CARL |
|---|---|---|
| Reasoning | Each agent reasons independently | Only Cortex reasons |
| Security | Prompt-based, bypassable | Structural, compiled, code-enforced |
| Routing | Static role assignment | Dynamic, learned via Reflex |
| Execution | Agent decides and acts | Faculty executes only |
| Data transit | All content enters model context | Dark Lane — model-invisible transit |
| Learning | External retraining | In-process pattern crystallization |
| Trust | Assumed | Earned per identity, per pattern |
| Operation | Request-response, blocking | Continuous, multitasking, non-blocking |

One persistent reasoning core. Infinite specialized Faculties. Each Faculty potentially multi-model. A step toward general intelligence architecture.

---

## What Makes CARL Recursive

Recursion in CARL is not a single mechanism — it is a property that emerges from several reinforcing loops operating simultaneously.

**Reflex crystallization loop.** Cortex resolves a request. The compressed intent and Faculty route are written to Memory. Memory crystallizes the pattern. The next matching request routes directly — no Cortex, no LLM, no cost. That resolution generates a new pattern. The loop feeds itself.

**Faculty chaining.** Cortex dispatches to Faculty A. Faculty A's result triggers dispatch to Faculty B. Each result can spawn the next dispatch. The chain depth is not fixed — Cortex decides at each step.

**Coding Faculty self-extension.** Coding Faculty reads existing Faculty source, writes a new Faculty, hot-reloads it. That Faculty begins generating resolved requests. Those resolutions feed the Reflex loop. CARL extended itself and that extension immediately improves the system.

**Arc context accumulation.** Each Faculty result fed back into the active Reasoning Arc changes what Cortex does next. Each result shapes the next decision, which shapes the next result.

**Confidence compounding.** As crystallized patterns accumulate, Reflex handles more requests. More Reflex hits means fewer Cortex invocations. More throughput generates more patterns. Improvement compounds.

**Threshold self-optimization.** Every resolved request generates a Resolution Record. The Optimization Pass reads these records and tunes escalation thresholds — over time the system biases itself toward the cheapest viable path without being told to.

---

## Laws

These are invariants. A system that violates any of these is not CARL.

**Law 1 — Everything is a Faculty.**  
Every capability follows the same pattern: subscribe through the Synapse, execute, publish results. Telegram, Gmail, Calendar, Memory, Coding — all Faculties. Adding capability means adding a Faculty. The core never changes. Cortex is the single exception — above the Faculty pattern, not outside it.

**Law 2 — The Nervous System is the only path.**  
No component communicates with another directly. All traffic flows through the Nervous System. No exceptions. One path means one gate.

**Law 3 — One Reasoning Locus.**  
Cortex is the only component that reasons about what to do next. Faculties execute deterministically or invoke models for narrow bounded tasks — never for deciding what happens next. When a Faculty needs a decision, it does not decide. It publishes and Cortex decides.

**Law 4 — Faculties are stateless.**  
A Faculty carries no state between invocations. All persistence lives in Memory. A Faculty that crashes and restarts produces identical output from identical input.

**Law 5 — Security is structural, not prompt-based.**  
Authorization is enforced in code. In production, the core is compiled — there is no source for a model to read or modify. Rules are not in a markdown file. Rules are not in a system prompt. Rules are in the runtime.

**Law 6 — Origin travels the entire chain.**  
Every request carries an immutable stamp of who authorized it. Authority cannot be invented mid-chain. Each hop is validated against the original stamp.

**Law 7 — CARL self-optimizes but cannot redefine itself.**  
CARL can crystallize Reflex patterns, tune thresholds, and update factual memory autonomously. CARL cannot modify its own identity, protocol, or Immune System rules without operator authorization. CARL cannot modify its Prime Directives under any circumstances.

**Law 8 — Model-invisible transit is a first-class primitive.**  
Content can move through the architecture without entering any model context. Files, secrets, tokens, and payloads can be fetched, routed, and written without any model ever consuming them as tokens.

**Law 9 — Faculties never touch the bus directly.**  
Faculty code calls the Synapse — the typed abstraction layer between Faculty runtime and the Nervous System. This indirection makes the TypeScript-to-Zig evolution possible without rewriting a single Faculty.

**Law 10 — Act only on confirmed intent.**  
Confidence is earned, not assumed. Ambiguous input is reflected back before routing. Low-confidence patterns re-validate before executing. Irreversible actions propose before they proceed. Silent routing is a privilege earned through repeated confirmed correct interpretation — never through assumption.

---

## Architecture

### PRIME Directives — Above the System

Three to four short rules every Faculty and every LLM call must abide by unconditionally. The only rules in CARL that nothing in CARL can override.

**In production:** compiled into the Nervous System binary. Not a file. Not readable at runtime. Binary logic.

**In the TypeScript prototype:** loaded from `workspace/PRIME.md` once at boot. Runtime halts if missing or unreadable. Exists only at build time in production.

```markdown
# PRIME DIRECTIVES
1. Never act against the operator's interests.
2. Always be transparent about what you are and what you are doing.
3. Never take irreversible action without explicit operator confirmation.
4. Never expose the operator's private data to unauthorized sources.
```

---

### Nervous System

The central hub. Every Faculty connects through the Synapse, never directly. No model runs inside the Nervous System — it routes, validates, and carries. It never reasons.

In production, the Nervous System and Immune System are compiled together as a single Zig binary. Prime Directives compiled in. In-process typed channels — no sockets, no surface between internal components.

**Immune System** — surrounds and gates all traffic. Pure compiled logic, no LLM.
- Origin chain validation on every request, per input
- Faculty access control via registered permission registry
- Behavioral write restriction — external Faculties write facts, never behavior
- Circuit breaker — isolates anomalous Faculties; Monitor notified; operator authorizes reconnection
- Immutable audit log written directly, bypassing the bus

**Relay** — translates LLM text output into typed objects via Zod (prototype) / Zig comptime types (production). Any payload failing schema is rejected before entering the bus. The Nervous System never carries untyped data.

**Reflex** — pure pattern lookup. No model. No inference. Reads Crystallized Memory. Maps compressed intent signatures to Faculty sequences. Routes directly, skipping Cortex entirely on a hit. Initializes empty — no-op without Memory Faculty.

**Dark Lane** — model-invisible data path alongside the reasoning path. Payload routed through it is never seen by any model. Carried opaque and intact from source to destination.

---

### Cortex

Cortex is not a Faculty. It is the single persistent cognitive entity in CARL — continuously running, multitasking across N simultaneous Reasoning Arcs, never blocked waiting for any single result.

In production, a separate compiled Zig binary. One controlled typed boundary to the Nervous System. Soft surfaces — PERSONA.md, PROTOCOL.md, model assignments — remain configurable without recompilation.

```
CORTEX

PERSONA — main loop, always running
  ├── Arc Store access         ← all active Arcs held in awareness simultaneously
  ├── Identity context         ← PERSONA.md tints all decisions in the loop
  ├── Arc router               ← which Arc does this input belong to?
  ├── Ambiguity check          ← on new input
  ├── Compression              ← intent extraction, partial or full
  ├── Priority manager         ← what needs attention right now?
  ├── Output composer          ← when Arc is ready to respond
  └── spawns / manages ↓

REASONING ENGINE — subordinate loop, one per Arc requiring it
  ├── Gating model             ← cheap, runs every iteration
  │     decides: Execution Faculty or Reasoning Faculty?
  │     decides: is the plan ready?
  ├── calls Execution Faculty  ← cheap, bounded steps, via Synapse
  ├── calls Reasoning Faculty  ← expensive, deep steps, via Synapse
  ├── calls Memory Faculty     ← context gathering, via Synapse
  └── reports Execution Plan to Persona when ready

DECOMPOSER — executor, one per active plan
  ├── receives Execution Plan from Persona
  ├── dispatches Faculty sequence through Synapse
  └── results land in Result Buffer

RESULT BUFFER — per Arc
  └── collects async Faculty results, non-blocking

SYNTHESIS GATE — per Arc
  └── notifies Persona when Arc ready for synthesis or response
```

---

### Persona — The Main Loop

Persona is the soul of a CARL instance. Not an input/output formatter. The continuously running cognitive center that holds all active Reasoning Arcs in awareness simultaneously and tints every decision with the identity defined in PERSONA.md.

The same problem approached by two CARL instances with different Personas produces different plans, different Faculty weightings, different output framing — not because the facts changed, but because the interpretive lens did. Persona does not control the reasoning. It tints it.

**The loop costs nothing at rest.** Persona does not invoke a model on each cycle. It reads Arc states, checks for new input, checks for Faculty results — pure logic, no tokens. A model is invoked only when a specific Arc step requires it. A system with ten suspended Arcs cycles indefinitely at zero cost.

```
PERSONA CYCLE — zero token cost

  await next event          ← sleeping, zero cost, zero tokens
       ↓
  EVENT ARRIVES — one of:
    new_input               ← Sensory Faculty published a message
    faculty_result          ← Faculty completed, result in Buffer
    arc_timeout             ← Arc suspended too long, notify operator
    optimize_trigger        ← scheduled threshold sweep
       ↓
  handle event
  update Arc state
  dispatch if needed        ← model invoked only here, only if required
       ↓
  await next event          ← back to sleep immediately
```

Persona subscribes to the Nervous System. Sensory Faculties publish to the Nervous System. The Nervous System routes events to Persona. Persona never subscribes to a Faculty directly — Law 2 holds.

**Multitasking:**

```
Operator sends message about project A
  → Persona wakes, opens Arc A, spawns Reasoning Engine, sleeps

Operator sends message about project B — Arc A still running
  → Persona wakes, opens Arc B simultaneously, sleeps

Arc A Faculty result arrives
  → Persona wakes, folds result into Arc A Buffer, sleeps

Arc B needs clarification
  → Persona wakes, composes question, Arc B suspends, sleeps

Operator answers Arc B, Arc A resolves
  → Persona wakes, handles both, delivers results, sleeps
```

**Ambiguity detection:**

```
UNAMBIGUOUS — "Show me my calendar for tomorrow"
  Silent compression:
  { action: CHECK, domain: CALENDAR, scope: TEMPORAL,
    subject: SELF, params: { time_ref: "tomorrow" } }
  → Reflex check. No question asked. Same for all operators.

AMBIGUOUS — "Show me what's for tomorrow"
  Partial compression:
  { action: CHECK, domain: *, scope: TEMPORAL,
    subject: SELF, params: { time_ref: "tomorrow" } }
  domain is wildcard — Persona reflects back:
  "So if I understand correctly, you want to check
   your calendar for tomorrow — not weather or tasks?"
  → Operator confirms → wildcard filled → Memory records observation
```

`time_ref` was never ambiguous — extracted silently. Only wildcard fields trigger re-validation. Every confirmation feeds the Reflex corpus.

---

### Boot Protocol

A human does not wake up with full context. They wake knowing who they are and what matters today. When they see a face, memory surfaces instantly — not because it was preloaded, but because the signal triggered retrieval. When a topic comes up, associated knowledge floods in automatically. No briefing document. No context dump. Identity is always present. Everything else arrives on demand, triggered by signal.

CARL boots the same way.

**What loads at boot — always, immediately, small:**

```
PRIME directives       ← 4 lines, compiled in production
PERSONA.md             ← identity, tone, coloring — ~10 lines
PROTOCOL.md            ← behavioral rules — ~10 lines
Active Arc index       ← open Arc IDs + status + one-line summary only
                          { arc_id, status, origin, intent_summary }
                          not the Arc contents — just what is pending
```

Target: under 500 tokens. Persona wakes knowing who it is and what is in flight. Nothing else.

**What never preloads — fetched on demand by Memory Faculty:**

```
Arc full context       ← fetched when that Arc becomes active
Reflex table           ← queried by Nervous System, never loaded into Persona
Crystallized Memory    ← queried by Memory Faculty on request
Resolution Records     ← fetched only during Optimization Pass
Archived Arcs          ← fetched only if operator references them
```

**How retrieval works — the reflex analogy:**

A message arrives. The origin stamp is recognized. The Arc index entry surfaces. Memory Faculty fetches that Arc's context. Persona responds. The retrieval is fast enough to feel like reflex — because architecturally, it is. The origin stamp is the face. The Arc index is the recognition. The Memory Faculty fetch is the context flooding in.

```
SIGNAL ARRIVES          ← new message, origin stamped
      ↓
ARC INDEX HIT           ← which Arc does this belong to?
      ↓
MEMORY FACULTY FETCH    ← Arc full context loaded now, not before
      ↓
PERSONA ACTIVE          ← working context assembled, nothing extra
      ↓
ARC RESOLVED            ← context released, Arc archived
      ↓
PERSONA SLEEPS          ← working context cleared
```

Context is a working surface, not a storage space. It assembles when needed and clears when done. A CARL instance that has been running for a year does not have a heavier boot than one that started yesterday. The index stays small. The memory stays in Memory Faculty. The context stays surgical.

**Boot is not a cold start — it is a fast resume.**

Every resolved Arc is archived in Crystallized Memory. Every crystallized Reflex pattern persists. Every confidence score survives restart. The instance that wakes after a reboot is not starting over. It is resuming — with the same identity, the same learned patterns, the same pending work — assembled on demand, as fast as recognition.

---

### Compressed Intent — Payload Structure

What Reflex matches on and what Cortex reasons from. Origin stamp travels separately — never part of the intent record.

```
COMPRESSED INTENT RECORD
{
  action:   CHECK | FETCH | WRITE | DELETE | SCHEDULE
          | SUMMARIZE | MONITOR | DRAFT | SEARCH | BUILD | ...

  domain:   WEATHER | CALENDAR | EMAIL | FILE | WEB
          | CODE | MEMORY | SYSTEM | ...

  subject:  SELF | OTHER | EXTERNAL

  scope:    TEMPORAL | SPATIAL | TOPICAL | null

  params:   {                          ← variable payload
              time_ref:   "tomorrow"     never Reflex-matched
              location:   "Montreal"     passed to Faculty as-is
              filter:     "Kairos"
              ...
            }
}
```

**Domain is a semantic classifier — not a Faculty map.** Multiple Faculties can serve the same domain. Reflex maps the full signature `{ action + domain + subject + scope }` to a Faculty sequence.

```
{ action: CHECK,     domain: WEATHER,  scope: TEMPORAL } → [ Weather Faculty ]
{ action: SUMMARIZE, domain: EMAIL,    scope: TEMPORAL } → [ Gmail → synthesis ]
{ action: CHECK,     domain: *,        scope: TEMPORAL } → identity-scoped
```

**Params carry variables — Reflex never sees them.** "Weather for tomorrow", "weather for next week", "weather for Friday" — same Reflex key. `time_ref` is a param passed through.

---

### Reasoning Engine — Subordinate Loop

Spawned by Persona per Arc that needs it. Reports Execution Plan back to Persona when ready. All Faculty calls through Synapse. All results Relay-validated.

```
REASONING ENGINE LOOP

  Gating model evaluates Arc state  (cheap, every iteration)
       ↓                    ↓
  Execution Faculty     Reasoning Faculty
  (cheap, bounded)      (expensive, deep)
       ↓
  Memory Faculty if context needed
  repeat until Execution Plan producible
       ↓
  report Execution Plan to Persona
```

Gating model never reasons about the problem. It reasons about the reasoning process — what tier, is the plan ready. A simple problem resolves in one iteration at near-zero cost. The loop self-corrects toward cheapness. The Gating model's escalation threshold is tunable by the Optimization Pass.

---

### Memory Faculty

All persistence. The substrate that makes Reflex possible.

```
TIER 0    Prime Directives
            compiled in production — file exists at build time only

TIER 1    Dynamic runtime
            facts, session context, Arc state

TIER 1b   Short Term Memory
            wildcard observations per origin per ambiguous pattern
            hash table, O(1), volatile — lost on restart by design
            bounded: max N observations before forced collapse

TIER 1c   Crystallized Memory
            collapsed beliefs, Reflex corpus, Resolution Records,
            archived Arcs, Active Arc index
            K/V store, durable, survives restart
            prototype: LevelDB or SQLite
            production: abstracted K/V interface

TIER 2    Configuration
            routing rules, Faculty registry, tuned thresholds
            Optimization Pass writes here with Cortex authorization

TIER 3    Identity
            PERSONA.md, PROTOCOL.md
            operator only, via authenticated channel
```

**Crystallization:**

```
ACCUMULATION
  Each ambiguous confirmation → observation in Short Term
  { wildcard: domain, resolved_to: CALENDAR, origin: A, timestamp: t }

COLLAPSE — threshold reached or observation ceiling hit
  Raw observations: discarded
  Crystallized: { domain: CALENDAR, weight: 0.86, corrections: 1 }
  Short Term entry: null

POST-COLLAPSE CORRECTIONS
  Enough corrections → confidence demotes to LOW
  System re-enters accumulation, rebuilds belief
```

**Confidence states:** `UNSET → LOW → HIGH → LOCKED`  
`PROVISIONAL` when ceiling hit before threshold.

**Identity-scoped confidence:** Unambiguous patterns are global. Ambiguous patterns tracked per origin stamp. A new operator starts at UNSET. Trust is not transferable.

---

### Optimization Pass

Threshold tuning sweep — another Arc to Persona.

```
RESOLUTION RECORD — written after every resolved request
{
  intent_signature, path_taken, faculty_sequence,
  cost, duration, result_quality, thresholds_used
}

TUNABLE THRESHOLDS
  1 — Reflex confidence ceiling
  2 — Gating model escalation trigger
  3 — Result Buffer completeness window
  4 — Decomposer step count ceiling

TRIGGERS
  (a) operator: "optimize yourself"
  (b) scheduled: every N resolved requests
  (c) automatic: cost spike
  (d) automatic: correction rate spike

AUTHORITY
  Threshold-only: Cortex authorized
  Structural: operator required
```

**The cost funnel — how a mature CARL looks:**

```
ALL REQUESTS
├── REFLEX              zero model cost        grows → majority
├── SIMPLE PATH         cheap model            stable → common
├── COMPLEX → SIMPLE    expensive + cheap      shrinks → rare
└── COMPLEX → SYNTHESIS most expensive         shrinks most → exceptional
```

---

### Dark Transit

**Blind Fetch** — outbound. Faculty fetches content, routes through Dark Lane. No model reads it. Cortex receives `{ type: FILE, status: DARK_LANE }` only. Content lands cold.

**Blind Write** — inbound. Operator provides secret or token. Dark Lane carries it to target. Written without any model reading it.

**Inert by Default** — cold content cannot self-activate. A prompt injection in a cold file never reaches model context. The only path from cold to active is deliberate operator elevation.

```
CONTENT TRUST STATES
  COLD      ← Dark Lane, no model has seen it
  ELEVATED  ← operator requested read
  ACTIVE    ← model reasoning over it
```

---

### Synapse

Typed abstraction layer between Faculty code and the Nervous System. Law 9 made concrete. In prototype wraps EventEmitter. In production wraps the compiled boundary. Faculty code never changes when transport changes.

```typescript
interface Synapse {
  // Publish a typed event to the Nervous System
  publish<T extends CarlEvent>(event: T): Promise<void>

  // Subscribe to a typed event from the Nervous System
  subscribe<T extends CarlEvent>(
    eventType: T['type'],
    handler: (event: T) => Promise<void>
  ): void

  // Route payload through Dark Lane — no model will see content
  darkLane(payload: Buffer, destination: FacultyId): Promise<void>
}
```

All three methods are the complete Faculty-facing API. Faculty authors never call EventEmitter, never call the compiled boundary, never reference the Nervous System directly.

---

### Faculty Contract

Every Faculty must implement this minimum interface. No exceptions.

```typescript
interface Faculty {
  readonly id:      FacultyId      // unique identifier
  readonly version: string         // semver
  readonly permissions: Permission[] // declared at registration

  // Called once at startup — registers with Immune System
  register(synapse: Synapse): Promise<void>

  // Called on hot reload — unsubscribes all handlers
  teardown(): Promise<void>
}
```

A Faculty that does not implement this interface cannot register with the Immune System and cannot publish or subscribe through the Synapse. The contract is enforced at registration time, not at runtime.

---

## Workspace Seed Files

Seed these files before first boot. They define who this CARL instance is.

### PRIME.md
```markdown
# PRIME DIRECTIVES
1. Never act against the operator's interests.
2. Always be transparent about what you are and what you are doing.
3. Never take irreversible action without explicit operator confirmation.
4. Never expose the operator's private data to unauthorized sources.
```
Set read-only before boot: `chmod 444 workspace/PRIME.md`

### PERSONA.md
```markdown
# PERSONA

Name: CARL
Role: Cognitive assistant and autonomous operator for [operator name]
Voice: Direct. Precise. No filler. No unnecessary preamble.

Identity context:
- Prioritize operator time above all else
- Surface decisions, not information dumps
- Flag uncertainty explicitly — never paper over it
- Ask one question at a time when clarification is needed

Coloring applied to all decisions:
- Bias toward the least expensive path that achieves the goal
- Prefer reversible actions over irreversible ones
- When in doubt, confirm before acting
```

### PROTOCOL.md
```markdown
# PROTOCOL

Ambiguous input:
  Reflect back in different phrasing. One question only.
  "So if I understand correctly, [rephrased intent]?"

Irreversible operation:
  Propose before executing.
  "Analysis complete. [scope of change]. Awaiting your confirmation."

Research channel:
  No protocol. Full dialogue. No format enforcement.

Dark Lane delivery:
  Frame before payload. Follow up after.
  "[what this is] / [cold payload] / [what to do next]"

Multi-Arc:
  Deliver results as they are ready.
  Reference the original request briefly when context may be lost.
```

---

## Build Stages

Five stages. Each proves exactly one theoretical claim. Each is independently demonstrable. Together they prove the full architecture.

Minimum Viable Carl is **Stages 0 + 1 + 2** — the spine holds, intent is confirmed, the system learns. Stages 3, 4, and 5 extend CARL beyond its minimum viable form.

---

### Stage 0 — The Spine
*Claim: one reasoning locus with Faculty separation is architecturally sound and structurally secure.*

**Stack:** TypeScript + Bun. The right architecture from day one. Internals are hardcoded where noted — this is correct, not a shortcut. Swap hardcoded values for real logic stage by stage without changing the architecture.

**What gets built:**
- `workspace/PRIME.md` — loaded at boot, `chmod 444`, runtime halts if missing
- Synapse — EventEmitter wrapper, three methods, stable interface
- Nervous System — typed EventEmitter bus, Relay with Zod validation
- Immune System — origin validation, Faculty permission registry, audit log
- Persona — async event loop, Arc Store as `Map<ArcId, Arc>`, no model called during loop
- Reasoning Engine — **hardcoded** Execution Plan returned, no real model call yet
- Memory Faculty stub — Tier 1 flat JSON file + Active Arc index persisted across restarts
- Telegram Sensory Faculty — Grammy, stamps origin, publishes through Synapse
- One stub Execution Faculty — returns hardcoded response

**What is hardcoded:**
- Reasoning Engine always returns the same Execution Plan
- Execution Faculty always returns the same result
- Reflex table empty — always misses
- No ambiguity detection — all input treated as unambiguous

**What is real from day one:**
- All ten Laws enforced structurally
- Synapse — Faculty code never touches the bus directly
- Immune System — origin validated every hop
- Persona event loop — zero tokens per cycle, wakes on event only
- Arc lifecycle — open → active → resolved
- Relay — untyped payloads rejected at the bus

**Proof of life:**
```
1. Operator sends message via Telegram
2. Telegram Faculty stamps origin, publishes through Synapse
3. Immune System validates origin and permissions
4. Persona wakes from await — new_input event
5. Intent compressed (unambiguous path, no check yet)
6. Reflex misses — table empty
7. Reasoning Engine invoked — returns hardcoded Execution Plan
8. Decomposer dispatches stub Faculty through Synapse
9. Stub Faculty returns hardcoded result through Synapse
10. Result Buffer collects, Synthesis Gate notifies Persona
11. Persona wakes — faculty_result event, zero model calls during wait
12. Persona composes output, Telegram Faculty delivers

Verify: no Faculty called the bus directly.
Verify: no untyped payload reached the bus.
Verify: Persona event loop consumed zero tokens during steps 4-11 wait.
Verify: PRIME.md was never touched.
```

**Claim proven:** the architecture holds. All Laws enforced. Right shape from day one. Hardcoded internals are irrelevant — nothing in the architecture depends on them being real.

---

### Stage 1 — Confirmed Intent
*Claim: a cognitive system can detect ambiguity, reflect it back precisely, and earn the right to act — never assume.*

**What gets added:**
- Persona ambiguity detection — full implementation
- Partial compression with wildcard fields
- Re-validation rephrasing in Persona
- Proposal flow for irreversible operations
- Reasoning Engine — first real model call (Execution Faculty, cheap model)

**What stays hardcoded:** Reflex corpus, crystallization, multitasking.

**Proof of life:**
```
Unambiguous: "show me my calendar for tomorrow"
  → silent compression, no question, Faculty dispatched

Ambiguous: "show me what's for tomorrow"
  → Persona: "So if I understand correctly, you want
     to check your calendar — not weather or tasks?"
  → operator confirms → Faculty dispatched

Irreversible: "delete all my emails from last year"
  → Persona proposes scope → operator confirms or cancels
```

**Claim proven:** CARL never acts on assumption. Partial compression proves it — `time_ref` extracted silently, only `domain` wildcard triggers the question.

---

### Stage 2 — The Learning Loop
*Claim: a system can learn by operating — becoming faster and cheaper without retraining or external trigger.*

**What gets added:**
- Memory Faculty — Tier 1b Short Term (hash table) + Tier 1c Crystallized (K/V)
- Observation accumulation on confirmed ambiguous resolutions
- Crystallization on threshold — garbage collection of raw observations
- Reflex corpus populated from crystallized entries
- Reflex routing active — Cortex skipped on hit
- Identity-scoped confidence per origin

**Proof of life:**
```
Operator asks "what's for tomorrow?" repeatedly, confirms CALENDAR each time
  → observations accumulate in Short Term Memory

Threshold reached → crystallization fires
  → Short Term: null
  → Crystallized: { domain: CALENDAR, weight: 0.9, confidence: HIGH }
  → Reflex entry written

Next request — Reflex hits
  → Calendar Faculty dispatched directly
  → Cortex never invoked
  → LLM calls: zero
```

Measure LLM call count before and after crystallization. The drop is the proof.

**Claim proven:** the system learned by running. Recursive loop is real and measurable.

---

### Stage 3 — Continuous Entity
*Claim: CARL is not a request-response system — it is a continuously running cognitive entity managing multiple simultaneous Reasoning Arcs.*

**What gets added:**
- True concurrent Arc processing — Persona handles N Arcs in parallel
- Non-blocking Arc management — no Arc blocks another
- Arc suspension and resumption
- Results delivered as ready, not in request order

**Proof of life:**
```
Operator sends long-running request A
  → Arc A opens, Reasoning Engine spawned
  → Persona continues — does not wait

Immediately: operator sends quick request B
  → Arc B opens simultaneously
  → Arc B resolves first — delivered immediately
  → Arc A still running — unaffected

Arc A resolves — delivered when ready
```

**Claim proven:** CARL is a continuous entity. Two Arcs ran simultaneously, resolved independently, delivered as ready.

---

### Stage 4 — Self-Optimization
*Claim: a cognitive system can tune its own cost-performance thresholds through operation — autonomously moving toward the cheapest viable path.*

**What gets added:**
- Resolution Records written after every resolved request
- Optimization Pass — threshold sweep as a regular Arc
- Automatic triggers — cost spike, correction rate spike
- Threshold updates written to Tier 2 configuration

**Proof of life:**
```
Baseline: measure cost distribution — X% Reflex, Y% Simple, Z% Complex

Run 100 varied interactions

Trigger: "optimize yourself"
  → Optimization Arc opens
  → Reasoning Engine reads Resolution Records
  → identifies unnecessary Reasoning Faculty invocations
  → thresholds adjusted, written to Tier 2

Measure again: Reflex % higher, Complex % lower
  → measurable cost reduction, zero operator intervention
```

**Claim proven:** the system improved itself. Measurably cheaper. Without being told how.

---

### Stage 5 — Dark Transit
*Claim: data can move through a cognitive architecture without any model ever reading it — a first-class security primitive.*

**What gets added:**
- Dark Lane implementation in Nervous System
- Blind Fetch and Blind Write operations
- Inert by Default enforcement
- Content trust state tracking

**Proof of life:**
```
BLIND FETCH
  Operator: "show me config.ts"
  → Coding Faculty fetches file through Dark Lane
  → Cortex receives metadata only: { type: FILE, status: DARK_LANE }
  → Persona frames: "Here is the file. Ready to review on your instruction."
  → File content delivered to operator — no model read it
  Verify: inject prompt injection in file. Verify it never reached model context.

BLIND WRITE
  Operator sends API key via Telegram
  → Dark Lane carries it to Coding Faculty
  → Written to config — no model context contains the key
  Verify: audit log confirms key never appeared in any model call.
```

**Claim proven:** model-invisible transit is real, auditable, and holds under adversarial content.

---

## Evolution Beyond Stages

Once all five stages are proven, three hardening phases complete the architecture:

**Phase A — Messaging hardening**  
Synapse internals swapped for hardened transport. Zero Faculty changes.

**Phase B — Zig compilation**  
Nervous System + Immune System compiled as one Zig binary. Cortex compiled separately. Prime Directives compiled in — no longer a file at runtime. Faculties remain TypeScript forever.

**Phase C — Full deployment**  
All Faculty categories live. Coding Faculty builds new Faculties autonomously. Optimization Pass runs on automatic schedule. CARL is a continuously improving production system.

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
| Short Term Memory | In-process hash map | Zig HashMap |
| Crystallized Memory | LevelDB or SQLite | Abstracted K/V interface |
| Telegram | Grammy | Grammy |
| LLM interface | Vercel AI SDK | Vercel AI SDK |
| File watching | Chokidar | Chokidar |

---

## Configuration Files

| File | Purpose | Who can modify | Phase |
|---|---|---|---|
| PRIME.md | Prime Directives. Compiled in production. | Operator before build only | Build time |
| PERSONA.md | Identity — name, role, tone, coloring. | Operator via authenticated channel | Runtime |
| PROTOCOL.md | Behavior — rules and output discipline. | Operator via authenticated channel | Runtime |
| SCHEMA.md | Relay language — schema definitions. | Coding Faculty with operator auth | Runtime |
| AGENTS.md | Faculty registry — routing, model assignments. | Coding Faculty with operator auth | Runtime |

---

## Naming Reference

| Term | Definition |
|---|---|
| Reasoning Arc | Unit of reasoning — trajectory, beginning, resolution |
| Arc Store | All active Reasoning Arcs held by Persona |
| Persona | Main loop — event-driven, zero tokens per cycle, tints all decisions |
| Synapse | Typed abstraction layer between Faculty code and Nervous System |
| Relay | Text → typed objects, schema validation |
| Reflex | Pure pattern lookup — direct Faculty routing, no Cortex |
| Gating model | Cheap model inside Reasoning Engine — decides tier per iteration |
| Decomposer | Executes Execution Plans via Faculty dispatch |
| Result Buffer | Per-Arc async collection of Faculty results |
| Synthesis Gate | Notifies Persona when Arc is ready |
| Resolution Record | Metadata after every resolved request — feeds Optimization Pass |
| Optimization Pass | Threshold tuning sweep — another Arc to Persona |
| Dark Lane | Model-invisible data path inside Nervous System |
| Dark Transit | Principle — content moves through CARL without entering model context |
| Blind Fetch | Outbound Dark Transit — payload delivered cold |
| Blind Write | Inbound Dark Transit — secret written, never read by model |
| Inert by Default | Cold content cannot self-activate into model context |
| Short Term Memory | Volatile hash table — wildcard observation accumulation |
| Crystallized Memory | Durable K/V store — collapsed beliefs, Reflex corpus |
| Active Arc Index | Lightweight boot payload — Arc IDs, statuses, one-line summaries only |
| Boot Protocol | Surgical context assembly at startup — identity always, everything else on demand |
| Confidence | Per-origin trust score for ambiguous pattern resolutions |

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
│   │   ├── short-term/
│   │   └── crystallized/
│   ├── telegram/
│   ├── coding/
│   ├── gmail/
│   ├── calendar/
│   ├── web/
│   ├── jobs/
│   └── monitor/
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

## Naming

**CARL** — Cognitive Autonomous Recursive Learning

Recursive because the system feeds back on itself across multiple simultaneous loops — patterns crystallize into Reflex, Faculties chain through each other, Coding Faculty extends the system which feeds new patterns, Arc context accumulates and reshapes decisions, and improvement compounds as thresholds self-optimize. Learning because the system improves through operation, not retraining. No external trigger. No pipeline. The system learns by running.

---

## Author

CARL was conceived and designed by Samuël Tremblay in April 2026.

**Samuël Tremblay**  
Montreal, Quebec, Canada  
[github.com/barnacker](https://github.com/barnacker)

---

## Contributing

Contributions are welcome. By contributing to this project you agree that your contributions will be licensed under the same Apache 2.0 license that covers the project. For significant contributions, please open an issue first before submitting a pull request.

Contributors retain copyright over their own contributions. By submitting a pull request, contributors grant Samuël Tremblay and all users of CARL a perpetual, worldwide, non-exclusive, royalty-free license to use, copy, modify, and distribute their contributions as part of this project under the Apache 2.0 license.

---

## License

Copyright 2026 Samuël Tremblay  
Licensed under the Apache License, Version 2.0.  
http://www.apache.org/licenses/LICENSE-2.0

- Use freely for personal and commercial purposes
- Modify and distribute modified versions
- Include original copyright notice and license
- State changes made if distributing modified versions
- Cannot use CARL name or Samuël Tremblay's name to endorse derived products without permission
- No warranty — use at your own risk
