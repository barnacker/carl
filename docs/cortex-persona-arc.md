# Cortex / Persona / ArcStore Ownership

## Boundary rule

Cortex is the boundary object. Persona and ArcStore are components owned by Cortex.

```text
createCortex()
  -> Cortex
       persona  -> Persona
       arcStore -> ArcStore
```

## Module ownership

```text
cortex/index.ts
  - cortexBoundary
  - Cortex
  - CortexDependencies
  - PersonaResponseSignal
  - createCortex()
  - orchestration from validated signal to ArcStore and Persona
  - re-exports Persona and ArcStore APIs for callers

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
```

Cortex API definitions do not belong in `cortex/persona/index.ts`.
Arc storage and lifecycle operations do not belong in `cortex/persona/index.ts`.
Persona is not the Arc database; it is the Cortex-owned executive/policy component used during Arc resolution.

## Runtime path

```text
incoming validated signal
  -> cortex.receiveSignal(signal)
  -> cortex.arcStore.openArc(signal.text)
  -> cortex.arcStore.activateArc(arc.id)
  -> cortex.persona.createResponse(activeArc, signal)
  -> cortex.arcStore.resolveArc(arc.id, response)
  -> Cortex emits PERSONA_RESPONSE
```

Direct component access is available for inspection and tests:

```ts
const cortex = createCortex()

cortex.persona.llmFacultyId
cortex.persona.primeDirective
cortex.persona.personaPromptMemoryRef

cortex.arcStore.listArcIndex()
cortex.arcStore.getArc(arcId)

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

## Current Arc execution scope

The current Arc loop is direct-resolution only:

```text
validated signal -> ArcStore opens Arc -> Persona produces response -> ArcStore resolves Arc
```

Tasks, faculty dispatch, memory retrieval, and model calls remain future slices. The public names still use final domain names.
