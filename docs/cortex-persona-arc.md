# Cortex / Persona / ArcStore / OrientationLoop Ownership

## Boundary rule

Cortex is the boundary object. Persona, ArcStore, and OrientationLoop are components owned by Cortex.

```text
createCortex()
  -> Cortex
       persona         -> Persona
       arcStore        -> ArcStore
       orientationLoop -> OrientationLoop
```

## Core labels

### Cortex

Top-level cognitive runtime boundary. Cortex owns coordination, stateful loops, routing, execution flow, and component wiring.

```text
Cortex = system brain/runtime boundary
```

### Arc

The Arc is CARL's defining object. Everything else in the system — Cortex, Persona, OrientationLoop, the faculties — exists to serve Arcs.

**An Arc is one bounded operator concern: a goal made executable.**

It is a trajectory with Synaptic Weight and Temporal Decay. It is not a session, not a message, not a task, and not a chat turn. In the current prototype, one operator message opens one Arc.

```text
Arc = one bounded operator concern with lifecycle, budget, and decay
```

#### Lifecycle, human-first

The mind processes a concern in stages that Wallas (1926, *The Art of Thought*) named: preparation, incubation, illumination, verification. CARL expresses the same shape as two orthogonal projections, not one state machine:

| Phase (human) | What is happening | Where it lives in CARL |
|---|---|---|
| Registration | The goal exists; nothing has been worked on it yet | Arc created, disengaged, never activated: projects `INCUBATING` |
| Admission | The concern enters the focus competition | `activated_at` written; afterwards it never reprojects `INCUBATING` (INV-ARC-9) |
| Preparation | The mind works the concern; the plan is built | `ENGAGED` during the design tick (0.06); before that, a disengaged arc without a plan projects `INHIBITED` |
| Illumination | The plan clicks into place | Plan maturity `UNDECOMPOSED → PLANNED` (0.06) |
| Execution | The plan runs | Plan maturity `EXECUTING` (0.06) |
| Verification, terminal | The goal is met, or the concern is folded in | `RESOLVED` / `ABSORBED` |

The two axes ask different questions and both are derived, never stored:

- **ArcState** — where does this Arc stand relative to the orienting loop right now, including its exit: `ENGAGED`, `INCUBATING`, `INHIBITED`, `RESOLVED`, `ABSORBED`. Derived at query time from Arc facts plus the current tick.
- **Plan maturity** — how far has the Arc's concern unfolded: `UNDECOMPOSED`, `PLANNED`, `EXECUTING`, `RESOLVED`. Proposed in 0.06; derived from the Arc's Tasks, not stored.

Because the axes are orthogonal, one Arc can be `INHIBITED` (lost the contest, focus went elsewhere) while `PLANNED` (design complete) — or `ENGAGED` while its plan is `EXECUTING`. Collapsing the two axes into one state machine is the drift the projection model exists to prevent.

Numbering note: only one Wallas stage needed a new ArcState — incubation. The current code projects it from the absence of `activated_at`; 0.06 re-keys the same branch to "no design fact" (plan still `UNDECOMPOSED`), so that display keeps its "not yet worked" semantics after an Arc has entered the loop but its plan still does not exist. Preparation is the work done *during* `ENGAGED` — design is engagement, so it owns no state of its own — and illumination is plan maturity, a plan fact, not an Arc display. Wallas names the vocabulary; the state machine stays five.

#### Stored atoms vs derived state

CARL stores facts, never states. The Arc record holds only the atoms: `title`, `target`, `summary`, lifecycle timestamps (`created_at`, `activated_at`, `resolved_at`), `budget` (`max_model_calls`, `max_faculty_dispatches`, `max_wall_time_ms`), `resource_needs`, `tasks`, `trace_refs`, `relations`, `resolution`, `absorbed_into_arc_id`. Everything else — how the Arc *presents* — is recomputed at query time from those atoms (SPEC §1.1, invariants INV-ARC-1 … INV-ARC-9):

```ts
if (arc.resolved_at) return "RESOLVED";
if (arc.absorbed_into_arc_id) return "ABSORBED";
if (currentTick?.engaged_arc_id === arc.id) return "ENGAGED";
if (arc.activated_at === undefined) return "INCUBATING";
return "INHIBITED";
```

The state you see is always recomputed from facts, so it can't drift. ArcState is the orienting loop's verdict on the Arc — recomputed per query. An Arc in the loop that lost the priority contest projects `INHIBITED`, carrying an optional cause (no cause = the resting default). An Arc that never entered the loop projects `INCUBATING`: held, warming, not suppressed — it holds no claim, and inhibition requires an invested claim. `activated_at` is never deleted once written (INV-ARC-9), so an Arc that entered the loop never reprojects `INCUBATING`.

Terminology: the fifth state shipped as `PENDING_DESIGN` in 2026-08-25 and was renamed `INCUBATING` the same day. "Pending" is queue vocabulary; "incubating" is the cognitive one — before a plan exists, the concern is held and warming, which is precisely the state it is in.

#### Why CARL never blocks

This is also what makes CARL never blocked. If you were chatting with him, you never wait — he gives you the hand back immediately. Every tick finishes and returns the operator; decision time is never spent waiting on faculties, so the human stays an operator, not a spectator in a blocking queue. And because nothing is stored as "current," nothing is pending inside the system either: there is no saved state to reconcile and nothing to wait on before acting. Projection keeps the system non-blocking about its own state, the same way ticks keep it non-blocking for the operator.

#### What the Arc is not

- **Not a session.** CARL has no session layer. The Arc is the bounded continuity object.
- **Not a message or chat turn.** One message may open one Arc; the Arc is a bounded concern that resolves, not a conversation thread.
- **Not a Task.** Tasks (0.06+) are durable executable units inside an Arc — one per Arc in the current scope. The Arc is the concern; a Task is one step of its plan.
- **Not a Sub-Arc.** A Sub-Arc is a Task promoted to its own concern thread when it needs independent budget, focus, and lifecycle.


### Task

A concrete executable step inside an Arc.

```text
Arc: Build Cortex skeleton
  Task: Create cortex/index.ts
  Task: Add tests
  Task: Run validation
  Task: Open PR
```

```text
Task = durable executable unit inside an Arc
```

### Sub-Arc

A promoted task that becomes complex enough to need independent tracking.

A task becomes a Sub-Arc when it needs separate reasoning, budget, waiting state, external dependency tracking, parallel focus, or an independent lifecycle.

```text
Sub-Arc = task promoted into its own concern thread
```

### ArcStore

Cortex-owned persistent state component for Arcs.

ArcStore stores and updates:

```text
Arc records
Task records
Sub-Arc links
states
future salience data
budgets
trace references
resolution data
```

Important boundary:

```text
Persona does not own Arc lifecycle.
ArcStore stores it.
Cortex components update it.
```

```text
ArcStore = durable working memory for active concerns
```

### PersonaInstance / Persona

Cortex component representing CARL's operator-facing identity and response policy.

Persona handles:

```text
prime directive
persona prompt memory reference
operator-facing response policy
voice/style constraints
identity-consistent framing
```

Persona may help create or frame an Arc, but Persona does not continuously drive the Arc lifecycle.

```text
PersonaInstance = identity/policy-facing faculty instance
```

### OrientationLoop

Cortex-owned loop that maintains situational awareness.

It repeatedly asks:

```text
What is happening?
What changed?
What matters now?
Which Arcs are open?
Which tasks are blocked?
What has become urgent?
What can be advanced cheaply?
What requires expensive reasoning?
```

It reads ArcStore, evaluates state, computes salience, and prepares focus decisions.

```text
OrientationLoop = Cortex situational-awareness loop
```

`OrientationLoop` is preferred over `AttentionLoop` because attention is overloaded by transformer model internals.

### Salience

Weighted importance of an Arc/task/candidate right now.

Inputs may include:

```text
urgency
operator priority
deadline
novelty
risk
blocked/unblocked state
dependency readiness
expected value
cost
budget
age
confidence
external event changes
```

Examples:

```text
urgent operator correction          -> high salience
stale low-value background cleanup  -> low salience
failing CI on active PR             -> high salience
waiting-for-human task              -> low or deferred salience
```

```text
Salience = computed "this matters now" score
```

### FocusCycle

Current 0.05 implementation bridge name for one bounded selection/evidence cycle produced by the OrientationLoop. The future taxonomy renames this concept to `OrientationTick`; until that rename is explicitly scoped, code keeps `FocusCycle` and treats `ENGAGED` as derived presentation, not stored state.

Typical sequence:

```text
read ArcStore
score salience
select candidate
choose faculty/tool/model
dispatch work
receive result
update ArcStore
emit trace
```

```text
FocusCycle = one bounded select/evidence cycle; future OrientationTick
```

Derived presentation state for current read models:

```ts
type DerivedArcState = 'ENGAGED' | 'INCUBATING' | 'INHIBITED' | 'RESOLVED' | 'ABSORBED'
```

### FocusDecision

The current 0.05 implementation bridge name for the decision produced by a FocusCycle. Future taxonomy renames it to `OrientationDecision`.

It answers:

```text
What should Cortex work on next?
Which Arc/task?
Which faculty?
How much budget?
What expected output?
What state update follows?
```

Current shape:

```ts
interface FocusDecision {
  arcId: string
  selectedTitle: string
  selectedState: DerivedArcState
  facultyId: string
  facultyRole: FacultyRole
  reason: string
  salience: SalienceScore
}
```

```text
FocusDecision = selected next action + target faculty
```

### Future orientation and background-loop taxonomy

Status: design note only. This taxonomy is not part of the current Alpha MVC 0.05 implementation scope.

Future naming direction:

```text
FocusCycle      -> OrientationTick
FocusDecision   -> OrientationDecision
FocusCandidate  -> OrientationCandidate
Current tick engagement -> ENGAGED
```

`SalienceScore` remains valid as the implementation-level score for what the formal specification calls effective signal strength.

Future Cortex mode values:

```text
CortexMode = CONSCIOUS | UNCONSCIOUS | DEGRADED
```

- `CONSCIOUS`: normal operator-facing operation.
- `UNCONSCIOUS`: cost-saving and memory-optimization mode entered after human-interaction idle timeout; first human interaction wakes Cortex back to `CONSCIOUS`.
- `DEGRADED`: fault/safety mode when core orientation or substrate guarantees are unavailable.

Future Cortex orientation state values:

```text
CortexOrientationState = DISORIENTED | SEEKING | ORIENTED
```

- `DISORIENTED`: bootstrap or error-only state where Arc/salience/world basis is not known enough to orient.
- `SEEKING`: Cortex is locating orientation by reading ArcStore, computing salience/effective signal strength, and preparing a decision.
- `ORIENTED`: Cortex knows where it is going and what to do now for one bounded tick.

Future loop split:

```text
CortexLoops = OrientationLoop | SubconsciousLoop | MaintenanceLoop
```

- `OrientationLoop`: conscious/operator-facing arbitration; handles interactive or high-salience Arcs.
- `SubconsciousLoop`: parallel autonomic Arc-processing loop for non-interactive Arcs; escalates ambiguity, operator input, or high-risk actions to the conscious path.
- `MaintenanceLoop`: non-Arc substrate upkeep such as memory crystallization, decay sweeps, trace/index maintenance, stale-result checks, health checks, and deterministic email triage. It may create or update Arcs, but does not engage them.

Future invariants:

```text
CARL stores facts, events, and durable commitments.
CARL derives operational states, modes, and orientation from those facts at query time.
Arc ENGAGED only during a bounded tick.
EngagementSource = ORIENTATION_LOOP | SUBCONSCIOUS_LOOP
No Arc remains ENGAGED after its tick terminates.
MaintenanceLoop does not ENGAGE Arcs.
UNCONSCIOUS mode biases toward cost reduction and memory/context optimization over task advancement.
```

Derived Arc presentation projection:

```ts
if (arc.resolved_at) return "RESOLVED";
if (arc.absorbed_into_arc_id) return "ABSORBED";
if (currentTick?.engaged_arc_id === arc.id) return "ENGAGED";
if (arc.activated_at === undefined) return "INCUBATING";
return "INHIBITED";
```

`INCUBATING` is the default projection for live Arcs that never entered the loop: stored, possibly still being analyzed or designed, or fresh and unfocused (`activated_at` absent). `INHIBITED` projects for Arcs already in the loop that the queried tick does not currently engage. No deferral reason applies to `INCUBATING` (INV-ARC-8). Eligibility, blockedness, faculty-pending status, suppression, and resource gaps are separate derived classifications from stored facts/events.

Async work model:

```text
ENGAGED
-> dispatch async work
-> tick terminates; presentation reprojects INCUBATING if the Arc never activated (INV-ARC-9 forbids reverting an activated Arc), otherwise INHIBITED unless `resolved_at` or `absorbed_into_arc_id` now applies
```

### Faculty

A callable capability provider.

A Faculty can be:

```text
LLM model
tool wrapper
code executor
retrieval system
memory search
email system
browser automation
specialized mini-model
expensive cloud reasoning model
deterministic pure-code function
```

```text
Faculty = callable capability
```

### FacultyInstance

A concrete configured executable instance of a Faculty.

Examples:

```text
PersonaInstance
HighReasoningInstance
MiniModelInstance
CodeFacultyInstance
EmailFacultyInstance
SearchFacultyInstance
```

Difference:

```text
Faculty         = capability type
FacultyInstance = configured runtime binding
```

### FacultyRouter

Future component that decides which FacultyInstance should handle a selected operation.

Inputs:

```text
task type
required capability
cost
latency
confidence needed
privacy constraints
available budget
model/tool availability
```

```text
FacultyRouter = dispatch selector
```

### FacultyRegistry

Future directory of available faculties and their metadata.

Stores:

```text
faculty id
capabilities
cost class
latency class
trust level
input/output schema
availability
routing constraints
```

```text
FacultyRegistry = catalog of callable capabilities
```

### HighReasoningInstance

Expensive, high-capability model faculty for hard reasoning.

Used for architecture decisions, deep debugging, multi-step planning, ambiguous tradeoffs, complex synthesis, and protocol review.

```text
HighReasoningInstance = costly heavyweight reasoning faculty
```

### MiniModelInstance

Cheap or specialized model faculty for narrow operations such as classification, routing, summarization, entity extraction, priority scoring, format conversion, or short rewrite.

```text
MiniModelInstance = cheap specialized inference faculty
```

### CodeFaculty

Deterministic or procedural code/tool execution faculty.

Used for running tests, editing files, querying git, calling APIs, parsing logs, calculations, database queries, and filesystem operations.

```text
CodeFaculty = non-LLM procedural execution capability
```

## Module layout rule

Use flat component files while a Cortex component has no meaningful internal subdivision. Promote a component to a folder with `index.ts` only after it has real private submodules worth grouping.

Current Stage 0 shape:

```text
cortex/
  index.ts              # Cortex boundary / public composition
  persona.ts            # Persona component
  arc-store.ts          # ArcStore component
  orientation-loop.ts   # OrientationLoop component
  reasoning-engine.ts   # deliberation policy and high-reasoning escalation boundary
  decomposer.ts         # breaks selected Arc work into Tasks or Sub-Arcs
  result-buffer.ts      # collects faculty outputs, evidence, and partial results before synthesis
  synthesis-gate.ts     # decides when buffered results are sufficient, conflicted, or blocked
```

Deferred folder shape, only when justified:

```text
cortex/persona/
  index.ts
  prompt-policy.ts
  response-policy.ts
  memory-binding.ts
```

This preserves final domain names without premature directory ceremony.

## Module ownership

```text
cortex/index.ts
  - cortexBoundary
  - Cortex
  - CortexDependencies
  - PersonaResponseSignal
  - createCortex()
  - orchestration from validated signal to ArcStore, OrientationLoop, and Persona
  - re-exports Persona, ArcStore, and OrientationLoop APIs for callers

cortex/persona.ts
  - personaBoundary
  - Persona
  - PersonaConfiguration
  - PersonaDependencies
  - createPersona()
  - Persona response policy and identity/model/prompt-memory properties

cortex/arc-store.ts
  - arcStoreBoundary
  - ArcStore
  - ArcStoreDependencies
  - ArcIndexEntry
  - createArcStore()
  - Arc opening, transition, resolution, indexing, and lookup

cortex/orientation-loop.ts
  - orientationLoopBoundary
  - OrientationLoop
  - SalienceScore
  - FocusCandidate
  - FocusCycle
  - FocusDecision
  - focusCycleRuleset
  - createOrientationLoop()
  - salience scoring, focus selection, and derived presentation projection for candidates

cortex/reasoning-engine.ts
  - reasoningEngineBoundary
  - deliberation policy boundary for expensive/high-reasoning passes
  - future owner of reasoning escalation criteria, critique passes, and answer-quality checks

cortex/decomposer.ts
  - decomposerBoundary
  - future owner of Arc-to-Task and Task-to-Sub-Arc decomposition
  - separates execution planning from Persona wording and ArcStore lifecycle persistence

cortex/result-buffer.ts
  - resultBufferBoundary
  - future owner of temporary faculty result aggregation for a current FocusCycle / future OrientationTick
  - tracks evidence, partial results, conflicts, and pending dependencies before synthesis

cortex/synthesis-gate.ts
  - synthesisGateBoundary
  - future owner of readiness decisions before operator-facing output
  - determines whether buffered results are sufficient, need more faculty work, conflict resolution, or blocking
```

Cortex API definitions do not belong in `cortex/persona.ts`.
Arc storage and lifecycle operations do not belong in `cortex/persona.ts`.
Salience scoring and focus selection do not belong in `cortex/persona.ts`.
Persona is not the Arc database or the Cortex loop; it is a Cortex-owned identity/policy component used by the current model-faculty-shaped direct response path.

## Runtime path

Current Stage 0 direct path:

```text
incoming validated signal
  -> cortex.receiveSignal(signal)
  -> cortex.arcStore.openArc(signal.text)
  -> cortex.arcStore.activateArc(arc.id)
  -> cortex.orientationLoop.createFocusCycle([activeArc])
  -> FocusCycle.decision selects the active Arc as ENGAGED presentation
  -> cortex.persona.createResponse(activeArc, signal)
  -> cortex.arcStore.resolveArc(arc.id, response)
  -> Cortex emits PERSONA_RESPONSE with FocusCycle and FocusDecision
```

Future full loop:

```text
Operator/Event enters Cortex
  -> Cortex creates or updates Arc in ArcStore
  -> OrientationLoop reads ArcStore
  -> OrientationLoop computes salience
  -> FocusDecision selects next Arc/task/faculty using derived presentation state
  -> FocusCycle dispatches work through FacultyRouter
  -> FacultyInstance returns result
  -> Cortex updates ArcStore
  -> repeat until `resolved_at` / `absorbed_into_arc_id` project terminal states; live Arcs project INCUBATING while never activated, otherwise INHIBITED while not engaged
```

Condensed:

```text
ArcStore holds what matters.
OrientationLoop decides what matters now.
FocusCycle does one thing about it.
FacultyRouter chooses who/what does it.
FacultyInstance executes.
Cortex updates ArcStore.
```

Direct component access is available for inspection and tests:

```ts
const cortex = createCortex()

cortex.persona.llmFacultyId
cortex.persona.primeDirective
cortex.persona.personaPromptMemoryRef

cortex.arcStore.listArcIndex()
cortex.arcStore.getArc(arcId)

cortex.orientationLoop.scoreArc(arc)
cortex.orientationLoop.selectFocusCandidate(arcs)
cortex.orientationLoop.decideFocus(candidate)
cortex.orientationLoop.createFocusCycle(arcs)

cortex.listArcIndex()
cortex.getArc(arcId)
```

## Current Persona properties

```ts
Persona {
  llmFacultyId: string
  primeDirective: string
  personaPromptMemoryRef: string
  createResponse(input): string
}
```

`personaPromptMemoryRef` is the current memory stub for retrieving the future Persona prompt. The prompt itself is not embedded in this slice.

## Current ArcStore properties

```ts
ArcStore {
  openArc(input): ArcStoreMutation
  activateArc(input): ArcStoreMutation
  resolveArc(input): ArcStoreMutation
  listArcIndex(): readonly ArcIndexEntry[]
  getArc(arcId): ArcRecord | undefined
}
```

## Current OrientationLoop properties

```ts
OrientationLoop {
  scoreArc(arc): SalienceScore
  selectFocusCandidate(arcs): FocusCandidate | undefined
  decideFocus(candidate): FocusDecision
  createFocusCycle(arcs): FocusCycle
}
```

## Current Arc execution scope

The current Arc loop is direct-resolution only:

```text
validated signal -> ArcStore opens Arc -> OrientationLoop produces FocusCycle/FocusDecision -> Persona produces response -> ArcStore resolves Arc
```

Tasks, FacultyRouter, FacultyRegistry, memory retrieval, high-reasoning dispatch, mini-model dispatch, pure-code faculty dispatch, and real model calls remain future slices. The public names still use final domain names.
