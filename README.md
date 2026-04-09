# CARL — Cognitive Autonomous Recursive Learning

CARL is a framework for building Cognitive Autonomous Recursive Learning systems — enabling systems that reason independently, self-protect by design, and improve through recursive pattern reinforcement.

CARL is not an agent framework.  
CARL is not a chatbot platform.  
CARL is not an automation tool.

CARL is a synthetic cognitive architecture. Every component maps to a functional analog in biological cognition. The result is a system that thinks, protects itself structurally, and improves the longer it runs.

-----

## Why CARL exists

Every existing AI framework thinks in agents. Discrete entities with roles. The agent paradigm made AI automation accessible but it is fundamentally limited. Agents are tools pretending to think.

CARL eliminates the agent concept entirely.

One Nervous System. Infinite Faculties. Each Faculty potentially multi-model — using whichever model is best for that specific capability at that specific moment. No agent boundaries. No role assignments. Just specialized capabilities connecting to a central reasoning core.

In most frameworks, you build agents — discrete entities that reason and act. In CARL, what you would call an agent is a Faculty. Faculties do not reason independently. They execute. Reasoning belongs to Cortex. The separation is intentional. When reasoning and execution are conflated, security breaks down, costs compound, and systems become unpredictable. CARL keeps them structurally apart.

A step toward general intelligence architecture.

-----

## Core Principles

**Everything is a Faculty.**  
Persona, Cortex, Telegram, Gmail, Calendar, Memory, Jobs, Monitor, Coding — all follow the same pattern. All subscribe and publish through the Nervous System. All pass through the Immune System. Adding a new capability means adding a new Faculty. The core never changes.

**The Nervous System is the only path between components.**  
No component communicates with another directly. All traffic flows through the Nervous System. This means the Immune System, which surrounds the Nervous System, effectively inspects all traffic without exception.

**Security is structural, not prompt-based.**  
Authorization is enforced in code, not in text that an LLM reads. A compromised Faculty cannot talk its way past the Immune System. The rules are binary and live in the runtime, not in a markdown file.

**Origin travels the entire chain.**  
Every request carries an immutable stamp of who originally authorized it. Authority cannot be invented mid-chain. Every hop is validated against the origin stamp.

**CARL self-optimizes but cannot redefine itself.**  
CARL can crystallize reflex patterns, optimize routing, and update factual memory autonomously. CARL cannot modify its own identity, protocol, or Immune System rules without operator authorization. CARL cannot modify its Prime Directives under any circumstances.

-----

## Architecture

### PRIME.md — Above the system

PRIME.md exists before CARL boots. It is authored by the operator and set read-only at the filesystem level before the system starts. No Faculty, no model, no runtime process can modify it. It contains three to four short rules that every Faculty and every LLM call must abide by unconditionally.

This is not a CARL component. It is above CARL. It is the only thing in the system that CARL itself cannot touch.

```bash
chmod 444 workspace/PRIME.md
```

Example contents:

```markdown
# PRIME DIRECTIVES

1. Never act against the operator's interests.
2. Always be transparent about what you are and what you are doing.
3. Never take irreversible action without explicit operator confirmation.
4. Never expose the operator's private data to unauthorized sources.
```

The operator writes these. The operator sets the permissions. CARL loads them at startup and cannot change them.

### Nervous System

The central hub. Every Faculty connects to it and only to it. Contains two internal mechanisms:

- **Relay** — translates LLM text output into typed objects using Zod schema validation. Invisible to all Faculties. Sits inside every publish and subscribe call.
- **Reflex** — a pattern lookup table populated from Memory. Matches known request patterns and routes directly to the appropriate Faculty without invoking Cortex. No LLM call. Instant. Grows over time as patterns crystallize.

### Immune System

Surrounds the Nervous System. Gates all traffic entering and leaving. No LLM is involved in enforcement — pure code logic. Responsibilities include:

- Origin chain validation on every request
- Faculty access control via a registered permission registry
- Behavioral write restriction enforcement
- Circuit breaker — isolates Faculties exhibiting anomalous behavior
- Immutable audit log written directly, bypassing the Nervous System

The Immune System enforces PRIME.md at the code level but cannot override it. The Immune System itself can only be modified by the operator via authenticated channel.

### Faculties

The Faculty is the only pattern in CARL. Every capability is a Faculty. Faculties are organized by function:

**Cognitive Faculties**

- **Persona** — the human interface. Receives messages, compresses to relay schema, formats results back into human language. Enforces the interaction protocol. The only Faculty that speaks to humans.
- **Cortex** — the reasoning bridge. Invokes the configured reasoning model. Produces typed Execution Plans. Synthesizes Faculty results. The only Faculty that reasons.

**Sensory Faculties**

- **Telegram** — receives messages from Telegram. Stamps origin. Publishes to Nervous System.
- **Discord** — same pattern, Discord channels.
- **WhatsApp** — same pattern, WhatsApp.
- Any new channel = new Sensory Faculty. Zero changes to core.

**Execution Faculties**

- **Gmail** — email read, triage, draft. Never sends autonomously.
- **Calendar** — scheduling, reminders, availability.
- **Web** — search, fetch, summarize.

**Infrastructure Faculties**

- **Coding** — reads and writes source files, MD files, routing rules, and Faculty code. The hands of the system. Can build new Faculties by reading existing ones for patterns. Authorization tier determines what it can touch — see Security Model below.
- **Memory** — reads and writes all persistent storage. Dynamic runtime data, crystallized patterns, and the MD workspace files. Tiered authorization controls what can be written by whom.
- **Jobs** — scheduled execution. Cron-triggered Faculty. Same pattern as all others, different trigger.
- **Monitor** — receives Immune System alerts. Notifies the operator.

### Memory and the MD Workspace

Memory Faculty owns all persistence. The workspace MD files are part of Memory — they are crystallized, semi-static knowledge that defines who CARL is and how it operates.

```
MEMORY TIER 0 — immutable
  PRIME.md — Prime Directives
  Filesystem read-only, set before boot
  Nothing in CARL can write this

MEMORY TIER 1 — dynamic runtime
  Facts, patterns, session context
  Cortex and Coding Faculty can write freely

MEMORY TIER 2 — configuration
  Routing rules, Faculty registry, model assignments
  Coding Faculty can write with operator authorization

MEMORY TIER 3 — identity
  PERSONA.md — who the instance is
  PROTOCOL.md — how the instance operates
  Operator only, via authenticated channel
```

-----

## Security Model

### Trust Hierarchy

|Source                            |Behavioral Write|Factual Write|Structural Change|Prime Directives|
|----------------------------------|----------------|-------------|-----------------|----------------|
|Operator via authenticated channel|YES             |YES          |YES              |NO (filesystem) |
|Cortex Faculty                    |YES             |YES          |NO               |NO              |
|Coding Faculty + operator auth    |YES             |YES          |YES              |NO              |
|Coding Faculty alone              |NO              |YES          |NO               |NO              |
|Gmail / Web / external Faculties  |NEVER           |YES          |NEVER            |NO              |
|Unauthenticated source            |NEVER           |NEVER        |NEVER            |NO              |

Nobody can modify PRIME.md at runtime. The filesystem enforces this before any code runs.

### Origin Chain

Every message entering the system through a Sensory Faculty is stamped with a cryptographically verified identity. This stamp is immutable. It travels through every hop — Persona, Cortex, all Faculty invocations — and is validated at each step. No component can elevate its own authority by modifying the origin field.

### Circuit Breaker

The Immune System monitors Faculty behavior. Anomalous patterns — unexpected message types, volume spikes, repeated schema validation failures — trigger isolation. The affected Faculty is disconnected from the Nervous System. Monitor Faculty is notified. The operator receives an alert and must authorize reconnection.

### Self-Awareness

Every Faculty registers its own metadata on startup — name, version, source path, active model, authorized callers, capabilities. Cortex can query the Faculty registry at any time. CARL knows what Faculties exist, what they can do, and which models they use. Coding Faculty can read existing Faculty source to understand patterns before building new ones.

-----

## Interaction Protocol

The protocol is defined by the operator through PERSONA.md. CARL ships with a neutral default. The example below is one possible implementation — a concise, machine-like style that some operators prefer.

**Standard request — one post from Persona:**

```
Strategy identified: [Faculty name].
Processing request.
```

**Faculty response — one post:**

```
Done.
[results]
```

**Ambiguity — one post:**

```
Need clarification.
[one question only]
```

**Research channel — no protocol.** Full dialogue between operator and Cortex. No state machine. No format enforcement.

**Interactive Faculty (destructive or irreversible operations) — proposal flow:**

```
Analysis complete.
[proposed changes]
Awaiting your confirmation.
```

Operator replies to confirm or cancel. Faculty proceeds or stops.

### Persona style

The tone, voice, and personality are entirely defined by the operator through PERSONA.md. CARL imposes no default style. Some operators prefer a warm conversational assistant. Others prefer a precise, efficient, machine-like voice. One early instance of CARL was configured with a fictional robot persona — brief, declarative, no small talk — inspired by science fiction AI archetypes. That persona style is included in the examples directory as a starting point.

The protocol structure above is persona-agnostic. The words can be whatever fits the operator’s intent.

-----

## Configuration Files

|File       |Purpose                                                |Who can modify                    |
|-----------|-------------------------------------------------------|----------------------------------|
|PRIME.md   |Prime Directives. Immutable at runtime.                |Operator before boot only         |
|PERSONA.md |Who the instance is. Name, role, tone, voice.          |Operator via authenticated channel|
|PROTOCOL.md|How the instance operates. Rules and output discipline.|Operator via authenticated channel|
|SCHEMA.md  |The relay language. Shorthand schema definitions.      |Coding Faculty with operator auth |
|AGENTS.md  |The org chart. Faculty routing and model assignments.  |Coding Faculty with operator auth |

-----

## Hot Reload

CARL never requires a restart to apply changes. The Nervous System exposes a lifecycle channel on the event bus. When a file changes:

1. File watcher detects the change
1. Lifecycle event published to Nervous System
1. Affected Faculty unsubscribes its handlers
1. Fresh module loaded
1. Faculty resubscribes with new handlers
1. Next message routes to fresh code

PRIME.md is the only file that does not participate in hot reload. It is read once at startup and never re-read. Changing it requires a restart — by design.

-----

## Stack

|Component        |Technology               |
|-----------------|-------------------------|
|Runtime          |Bun                      |
|Language         |TypeScript               |
|Event bus        |Node EventEmitter (typed)|
|Schema validation|Zod                      |
|Telegram         |Grammy                   |
|LLM interface    |Vercel AI SDK            |
|File watching    |Chokidar                 |

-----

## MVP Scope

The minimal implementation that proves the architecture end to end:

1. PRIME.md seed file with filesystem permissions set
1. Nervous System core with EventEmitter and lifecycle channel
1. Immune System basic gate with origin validation and Faculty registry
1. Relay inside Nervous System with Zod validation
1. Telegram Faculty — sensory input
1. Persona Faculty — human interface and protocol enforcement
1. Cortex Faculty — reasoning bridge with Execution Plan
1. Memory Faculty stub — flat file read/write with tiered authorization
1. PERSONA.md, PROTOCOL.md, SCHEMA.md seed files

> This README describes the full intended architecture. The current implementation covers MVP scope only. See the MVP section above for what is built today.

-----

## Repository Structure

```
carl/
├── nervous-system/
├── immune-system/
├── faculties/
│   ├── persona/
│   ├── cortex/
│   ├── coding/
│   ├── memory/
│   ├── telegram/
│   ├── discord/
│   ├── gmail/
│   ├── calendar/
│   ├── web/
│   ├── jobs/
│   └── monitor/
├── schema/
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

-----

## Naming

**CARL** — Cognitive Autonomous Recursive Learning

The name describes what the framework enables, not what it produces. Recursive because the system feeds back on itself — patterns crystallize, routing improves, acquired behavior becomes innate, which generates new patterns. Learning because the system genuinely improves through operation, not through retraining.

-----

## Author

CARL was conceived and designed by Samuël Tremblay in April 2026.

**Samuël Tremblay**  
Montreal, Quebec, Canada  
[github.com/barnacker](https://github.com/barnacker)

-----

## Contributing

Contributions are welcome. By contributing to this project you agree that your contributions will be licensed under the same Apache 2.0 license that covers the project. For significant contributions, please open an issue first to discuss the proposed change before submitting a pull request.

Contributors retain copyright over their own contributions. By submitting a pull request, contributors grant Samuël Tremblay and all users of CARL a perpetual, worldwide, non-exclusive, royalty-free license to use, copy, modify, and distribute their contributions as part of this project under the Apache 2.0 license.

-----

## License

Copyright 2026 Samuël Tremblay

Licensed under the Apache License, Version 2.0 (the “License”). You may not use this software except in compliance with the License.

You may obtain a copy of the License at:

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an “AS IS” BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

A full copy of the Apache 2.0 license is available in the LICENSE file at the root of this repository.

### What this means in plain language

- You can use CARL freely for personal and commercial purposes
- You can modify CARL and distribute modified versions
- You must include the original copyright notice and license
- You must state what changes you made if you distribute a modified version
- You cannot use the CARL name or Samuël Tremblay’s name to endorse derived products without permission
- There is no warranty — use at your own risk