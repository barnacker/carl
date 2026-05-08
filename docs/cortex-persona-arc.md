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

An active unresolved concern, mission, problem, or thread of work.

Examples:

```text
"Build the Cortex skeleton"
"Answer this operator request"
"Investigate failed test suite"
"Monitor urgent email thread"
```

```text
Arc = active concern with lifecycle
```

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

One execution iteration selected by the OrientationLoop.

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
FocusCycle = one select -> dispatch -> update execution step
```

### FocusDecision

The decision produced before a FocusCycle executes.

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
  facultyId: string
  facultyRole: FacultyRole
  reason: string
  salience: SalienceScore
}
```

```text
FocusDecision = selected next action + target faculty
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

cortex/persona/index.ts
  - personaBoundary
  - Persona
  - PersonaConfiguration
  - PersonaDependencies
  - createPersona()
  - Persona response policy and identity/model/prompt-memory properties

cortex/arc-store/index.ts
  - arcStoreBoundary
  - ArcStore
  - ArcStoreDependencies
  - ArcIndexEntry
  - createArcStore()
  - Arc opening, transition, resolution, indexing, and lookup

cortex/orientation-loop/index.ts
  - orientationLoopBoundary
  - OrientationLoop
  - SalienceScore
  - FocusCandidate
  - FocusDecision
  - createOrientationLoop()
  - salience scoring and focus selection
```

Cortex API definitions do not belong in `cortex/persona/index.ts`.
Arc storage and lifecycle operations do not belong in `cortex/persona/index.ts`.
Salience scoring and focus selection do not belong in `cortex/persona/index.ts`.
Persona is not the Arc database or the Cortex loop; it is a Cortex-owned identity/policy component used by a FocusCycle when the selected faculty role is Persona.

## Runtime path

Current Stage 0 direct path:

```text
incoming validated signal
  -> cortex.receiveSignal(signal)
  -> cortex.arcStore.openArc(signal.text)
  -> cortex.arcStore.activateArc(arc.id)
  -> cortex.orientationLoop.scoreArc(activeArc)
  -> cortex.orientationLoop.decideFocus(candidate)
  -> cortex.persona.createResponse(activeArc, signal)
  -> cortex.arcStore.resolveArc(arc.id, response)
  -> Cortex emits PERSONA_RESPONSE with FocusDecision
```

Future full loop:

```text
Operator/Event enters Cortex
  -> Cortex creates or updates Arc in ArcStore
  -> OrientationLoop reads ArcStore
  -> OrientationLoop computes salience
  -> FocusDecision selects next Arc/task/faculty
  -> FocusCycle dispatches work through FacultyRouter
  -> FacultyInstance returns result
  -> Cortex updates ArcStore
  -> repeat until Arc is RESOLVED / DEFERRED / ABSORBED
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
}
```

## Current Arc execution scope

The current Arc loop is direct-resolution only:

```text
validated signal -> ArcStore opens Arc -> OrientationLoop produces FocusDecision -> Persona produces response -> ArcStore resolves Arc
```

Tasks, FacultyRouter, FacultyRegistry, memory retrieval, high-reasoning dispatch, mini-model dispatch, pure-code faculty dispatch, and real model calls remain future slices. The public names still use final domain names.
