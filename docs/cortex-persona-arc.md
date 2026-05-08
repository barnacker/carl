# Cortex / Persona / Arc Ownership

## Boundary rule

Cortex is the boundary object. Persona is a component owned by Cortex.

```text
createCortex()
  -> Cortex
       persona -> Persona
```

## Module ownership

```text
cortex/index.ts
  - cortexBoundary
  - Cortex
  - CortexDependencies
  - createCortex()
  - re-exports Persona API for callers

cortex/persona/index.ts
  - personaBoundary
  - Persona
  - PersonaConfiguration
  - PersonaDependencies
  - createPersona()
  - Persona-owned Arc lifecycle and Arc inspection
```

Cortex API definitions do not belong in `cortex/persona/index.ts`.
Persona is not the Cortex boundary; it is the Cortex-owned executive component that opens, tracks, and resolves Arcs.

## Runtime path

```text
incoming validated signal
  -> cortex.receiveSignal(signal)
  -> cortex.persona.receiveSignal(signal)
  -> Persona opens Arc
  -> Persona transitions Arc through OPEN -> ACTIVE -> RESOLVED
  -> Persona emits PERSONA_RESPONSE
```

Direct Persona access is available for component-level inspection and tests:

```ts
const cortex = createCortex()

cortex.persona.llmFacultyId
cortex.persona.primeDirective
cortex.persona.personaPromptMemoryRef
cortex.persona.listArcIndex()
cortex.persona.getArc(arcId)
```

## Current Persona properties

```ts
Persona {
  llmFacultyId: string
  primeDirective: string
  personaPromptMemoryRef: string
  receiveSignal(signal): Promise<PersonaResponseSignal>
  listArcIndex(): readonly ArcIndexEntry[]
  getArc(arcId): ArcRecord | undefined
}
```

`personaPromptMemoryRef` is the current memory stub for retrieving the future Persona prompt. The prompt itself is not embedded in this slice.

## Current Arc execution scope

The current Arc loop is direct-resolution only:

```text
validated signal -> Arc opened -> no tasks dispatched -> response produced -> Arc resolved
```

Tasks, faculty dispatch, memory retrieval, and model calls remain future slices. The public names still use final domain names.
