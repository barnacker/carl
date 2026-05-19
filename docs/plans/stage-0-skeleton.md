# Stage 0 Skeleton Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Create the first executable CARL Stage 0 skeleton with enforceable boundaries, schema contracts, and tests, without implementing intelligence beyond proof-of-life scaffolding.

**Roadmap:** The provisional continuation path toward a stable minimal viable Cortex module lives in `docs/plans/minimal-viable-cortex-roadmap.md`. That roadmap is explicitly review-required and must not be implemented version-by-version until the operator challenges, tunes, and approves the specific version scope.

**Alpha MVC 0.01 Scope:** Cortex is real; the world around it is harnessed. The first runtime slice drives fake Discord chat through fake Discord Faculty and fake Nervous-System relay interfaces into real Cortex. The harness invokes a real model using the current Hermes-compatible model URL/API key while imitating a model Faculty. Do not implement the real Nervous System or real Faculty bus in this slice. See `docs/alpha-mvc-0.01-harness.md`.

**Architecture:** Contract-first TypeScript prototype optimized for later Zig replacement. Core boundary data is plain serializable objects; validation and authority checks are pure functions; side effects stay behind adapters. Faculties declare requested capabilities, trusted workspace config grants capabilities, and the Immune System computes/enforces effective capabilities in later real-runtime slices; Alpha MVC 0.01 uses harness-level simulations only.

**Tech Stack:** TypeScript, Node test runner for the current environment, future Bun-compatible package scripts.

---

## Task 1: Add project tooling shell

**Objective:** Add minimal TypeScript/Node project files without application behavior.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Modify: `.gitignore`

**Verification:**
- Run `npm install`.
- Run `npm run typecheck` once source files exist.

## Task 2: Write Stage 0 boundary tests first

**Objective:** Define expected behavior before production code.

**Files:**
- Create: `tests/schemas/arc-state.test.js`
- Create: `tests/immune-system/capability-subset.test.js`
- Create: `tests/static/faculty-boundary.test.js`
- Create: `tests/workspace-template.test.js`

**Expected RED:**
- Tests fail because `dist/` modules and workspace templates do not exist yet.

## Task 3: Add plain-data schemas

**Objective:** Implement minimal schema constants and pure validation helpers.

**Files:**
- Create: `schemas/arc.ts`
- Create: `schemas/capabilities.ts`
- Create: `schemas/faculty-manifest.ts`
- Create: `schemas/origin-stamp.ts`
- Create: `schemas/trace-event.ts`
- Create: `schemas/index.ts`

**Verification:**
- `npm run build`
- `npm test`

## Task 4: Add Immune System permission core

**Objective:** Implement requested/granted/effective capability subset checks.

**Files:**
- Create: `nervous-system/immune-system/permission-registry/capability-subset.ts`
- Create: `nervous-system/immune-system/permission-registry/index.ts`

**Verification:**
- Capability tests pass.

## Task 5: Add skeleton folders and module boundaries

**Objective:** Create architecture-aligned directories with minimal exports.

**Files:**
- Create: `synapse/contract/synapse.interface.ts`
- Create: `synapse/index.ts`
- Create: `nervous-system/index.ts`
- Create: `nervous-system/relay/index.ts`
- Create: `nervous-system/bus/index.ts`
- Create: `nervous-system/routing/index.ts`
- Create: `nervous-system/trace/index.ts`
- Create: `cortex/index.ts`
  - Owns `Cortex`, `CortexDependencies`, `createCortex()`, and orchestration across Cortex components.
- Create: `cortex/persona.ts`
  - Owns `Persona`, `PersonaConfiguration`, `PersonaDependencies`, `createPersona()`, and response-policy/identity properties.
- Create: `cortex/arc-store.ts`
  - Owns `ArcStore`, `ArcStoreDependencies`, `createArcStore()`, and Arc opening, transition, resolution, indexing, and lookup.
- Create: `cortex/orientation-loop.ts`
  - Owns `OrientationLoop`, `SalienceScore`, `FocusCandidate`, `FocusDecision`, `createOrientationLoop()`, salience scoring, and focus selection.
- Create: `cortex/reasoning-engine.ts`
  - Owns `reasoningEngineBoundary` as the reserved boundary for deliberation policy, high-reasoning escalation criteria, critique passes, and answer-quality checks.
- Create: `cortex/decomposer.ts`
  - Owns `decomposerBoundary` as the reserved boundary for decomposing selected Arc work into executable Tasks or promoted Sub-Arcs.
- Create: `cortex/result-buffer.ts`
  - Owns `resultBufferBoundary` as the reserved boundary for collecting faculty outputs, evidence, partial results, conflicts, and pending dependencies during a FocusCycle.
- Create: `cortex/synthesis-gate.ts`
  - Owns `synthesisGateBoundary` as the reserved boundary for deciding when buffered results are sufficient, conflicted, blocked, or require more faculty work before operator output.
- Create: `faculties/stub/faculty.manifest.ts`
- Create: `faculties/memory/faculty.manifest.ts`

**Rule:** Faculties may import `synapse` and `schemas`; they must not import `nervous-system` or `cortex`.

## Task 6: Add workspace template

**Objective:** Separate tracked seed config from ignored runtime state.

**Files:**
- Create: `workspace-template/PRIME.md`
- Create: `workspace-template/PERSONA.md`
- Create: `workspace-template/PROTOCOL.md`
- Create: `workspace-template/SCHEMA.md`
- Create: `workspace-template/AGENTS.yaml`

**Verification:**
- Workspace template test passes.

## Task 7: Add Alpha MVC 0.01 fake-world harness

**Objective:** Drive real Cortex from a fake Discord/Nervous-System world without implementing the real Nervous System.

**Files:**
- Create: `docs/alpha-mvc-0.01-harness.md`
- Create: `harness/alpha-mvc.ts`
- Create: `bin/carltest.js`
- Create: `tests/harness/alpha-mvc-harness.test.js`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `cortex/persona.ts`
- Modify: `cortex/index.ts`

**Verification:**
- `carltest --discord "Hey how are you?"` constructs fake Discord ingress.
- Real Cortex opens, activates, and resolves an Arc.
- Harness invokes a real model Faculty boundary in production mode, or deterministic fake response under test override.
- No real Nervous System bus or real Faculty runtime is implemented.

## Task 8: Add harness-level safety and trace utilities

**Objective:** Keep the fake-world harness honest without claiming real Immune/Nervous System enforcement.

**Files:**
- Create: `nervous-system/immune-system/prime-check.ts`
- Create: `nervous-system/immune-system/index.ts`
- Create: `nervous-system/trace/in-memory-trace.ts`
- Create: `nervous-system/trace/replay.ts`
- Modify: `nervous-system/index.ts`
- Modify: `nervous-system/trace/index.ts`
- Modify: `schemas/origin-stamp.ts`

**Verification:**
- OriginStamp shape validation exists.
- PRIME presence check fails closed.
- Irreversible-action intent returns proposal/non-execution output.
- Trace replay reconstructs `OPEN → ACTIVE → RESOLVED`.

## Task 9: Final validation

**Objective:** Verify skeleton is buildable, testable, and boundary-aligned.

**Commands:**
- `npm run build`
- `npm run typecheck`
- `npm test`
- `git status --short`

**Acceptance:**
- All tests pass.
- TypeScript compiles.
- No runtime state committed.
- Faculty source does not import core internals.
