# Alpha MVC 0.01 Harness

## Status

Authoritative scope correction for the first CARL runtime iterations.

## Goal

Alpha MVC 0.01 implements a real Cortex inside a fake surrounding world. The harness imitates Discord, Faculties, and the Nervous System so Cortex can drive real Arc lifecycle and receive faculty-like results without requiring the real Nervous System implementation yet.

```text
carltest --discord "Hey how are you?"
→ fake Discord chat event
→ fake Discord Faculty interface
→ fake Nervous-System relay/interface harness
→ real Cortex
→ harness invokes real model Faculty using current Hermes model URL/API key
→ real Cortex receives faculty-like result
→ fake Discord-style output + trace evidence
```

## Scope

Real in this iteration:

- Cortex boundary and component wiring.
- ArcStore lifecycle: `OPEN → ACTIVE → RESOLVED` for the direct path.
- OrientationLoop FocusCycle selection.
- Persona response policy surface.
- Interfaces shaped like future subsystem boundaries.
- Model call: real model invocation by the harness using the current Hermes-compatible URL/API key.

Fake / harnessed in this iteration:

- Discord ingress.
- Discord Faculty publication.
- Nervous System relay.
- Model Faculty runtime wrapper.
- Discord-style output.
- Harness trace surface around Cortex.

Out of scope:

- Real Discord connection.
- Real Nervous System bus.
- Real Faculty dispatch infrastructure.
- Real Immune System enforcement beyond harness-level fail-closed checks.
- Reflex, Memory persistence, Semantic Index, Optimization Pass, Dark Transit.

## Command

```bash
carltest --discord "Hey how are you?"
```

The command is a test harness. `--discord` means "simulate Discord ingress". It does not connect to Discord.

## Safety floor simulation

The harness simulates only the minimum floor needed for Alpha MVC 0.01:

- Construct an origin-like envelope for fake Discord input.
- Validate the resulting `OriginStamp` shape before sending to Cortex.
- Check PRIME presence before starting the fake runtime path.
- Represent irreversible execution requests as proposal/non-execution text.
- Expose no execution side-effect API through the direct path.

These checks preserve the intended architecture contract without claiming that the real Immune System exists.

## Acceptance

Alpha MVC 0.01 is accepted when tests prove:

- CLI-like fake Discord input reaches real Cortex.
- Cortex opens, activates, and resolves an Arc.
- Harness invokes a model Faculty-like boundary for ordinary chat.
- Trace evidence reconstructs `OPEN → ACTIVE → RESOLVED`.
- PRIME-missing and irreversible-action cases fail closed or produce proposal-only output.
- No real Nervous System, real bus, or real Faculty runtime is implemented.
