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
Persona, Cortex, Telegram, Gmail, Calendar, Memory, Jobs, Monitor, Config — all follow the same pattern. All subscribe and publish through the Nervous System. All pass through the Immune System. Adding a new capability means adding a new Faculty. The core never changes.

**The Nervous System is the only path between components.**  
No component communicates with another directly. All traffic flows through the Nervous System. This means the Immune System, which surrounds the Nervous System, effectively inspects all traffic without exception.

**Security is structural, not prompt-based.**  
Authorization is enforced in code, not in text that an LLM reads. A compromised Faculty cannot talk its way past the Immune System. The rules are binary and live in the runtime, not in a markdown file.

**Origin travels the entire chain.**  
Every request carries an immutable stamp of who originally authorized it. Authority cannot be invented mid-chain. Every hop is validated against the origin stamp.

**Carl self-optimizes but cannot redefine itself.**  
Carl can crystallize reflex patterns, optimize routing, and update factual memory autonomously. Carl cannot modify its own identity, protocol, or Immune System rules without operator authorization.

-----

## Architecture

### Nervous System

The central hub. Every Faculty connects to it and only to it. Contains two internal mechanisms:

- **Relay** — translates LLM text output into typed objects using Zod schema validation. Invisible to all Faculties. Sits inside every publish and subscribe call.
- **Reflex** — a pattern lookup table populated from Memory. Matches known request patterns and routes directly to the appropriate Faculty without invoking Cortex. No LLM call. Instant.

### Immune System

Surrounds the Nervous System. Gates all traffic entering and leaving. No LLM is involved in enforcement — pure code logic. Responsibilities include:

- Origin chain validation on every request
- Faculty access control via a registered permission registry
- Behavioral write restriction enforcement
- Circuit breaker — isolates Faculties exhibiting anomalous behavior
- Immutable audit log written directly, bypassing the Nervous System

The Immune System is the only component that cannot be self-modified. Ever.

### Faculties

The Faculty is the only pattern in CARL. Every capability is a Faculty. Faculties are organized by function:

**Cognitive Faculties**

- **Persona** — the human interface. Receives messages, compresses to relay schema, formats results back into human language. Enforces the interaction protocol.
- **Cortex** — the reasoning bridge. Invokes the configured reasoning model. Produces typed Execution Plans. Synthesizes Faculty results before returning to Persona.

**Sensory Faculties**

- **Telegram** — receives messages from Telegram. Stamps origin. Publishes to Nervous System.
- **Discord** — same pattern, Discord channels.
- **WhatsApp** — same pattern, WhatsApp.
- Any new channel = new Sensory Faculty. Zero changes to core.

**Execution Faculties**

- **Gmail** — email read, triage, draft. Never sends autonomously.
- **Calendar** — scheduling, reminders, availability.
- **Web** — search, fetch, summarize.
- **Config** — self-modification under operator authorization only.

**Infrastructure Faculties**

- **Memory** — reads and writes to persistent storage. All access goes through the Nervous System and Immune System. Factual writes allowed from any authorized Faculty. Behavioral writes require operator authorization only.
- **Jobs** — scheduled execution. Cron-triggered Faculty. Same pattern as all others, different trigger.
- **Monitor** — receives Immune System alerts. Notifies operator.

### Memory

Not a layer. Not a special component. A Faculty like all others. Accessed through the Nervous System. Protected by the Immune System. Stores two categories:

- **Innate** — defined at initialization. PERSONA.md, PROTOCOL.md, SCHEMA.md, initial routing rules.
- **Acquired** — written at runtime. Learned reflex patterns, factual context, session history.

Repeated acquired patterns can be promoted to innate through a crystallization process, making them permanent reflexes. The system gets cheaper and faster over time as more requests are handled by Reflex instead of Cortex.

-----

## Security Model

### Trust Hierarchy

|Source                            |Behavioral Write|Factual Write|Structural Change|
|----------------------------------|----------------|-------------|-----------------|
|Operator via authenticated channel|YES             |YES          |YES              |
|Cortex Faculty                    |YES             |YES          |NO               |
|Persona Faculty                   |YES             |YES          |NO               |
|Config Faculty                    |YES             |YES          |NO               |
|Gmail / Web / external Faculties  |NEVER           |YES          |NEVER            |
|Unauthenticated source            |NEVER           |NEVER        |NEVER            |

### Origin Chain

Every message entering the system through a Sensory Faculty is stamped with a cryptographically verified identity. This stamp is immutable. It travels through every hop — Persona, Cortex, all Faculty invocations — and is validated at each step. No component can elevate its own authority by modifying the origin field.

### Circuit Breaker

The Immune System monitors Faculty behavior. Anomalous patterns — unexpected message types, volume spikes, repeated schema validation failures — trigger isolation. The affected Faculty is disconnected from the Nervous System. Monitor Faculty is notified. Operator receives an alert and must authorize reconnection.

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

**Interactive Faculty (destructive operations) — proposal flow:**

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

|File       |Purpose                                                                        |
|-----------|-------------------------------------------------------------------------------|
|PERSONA.md |Who the agent is. Name, role, tone, voice, relationship to operator.           |
|PROTOCOL.md|How the agent operates. Interaction rules, output discipline, delegation rules.|
|SCHEMA.md  |The relay language. Shorthand definitions for Faculty-to-Faculty communication.|
|AGENTS.md  |The org chart. Faculty routing rules, access registry, model assignments.      |

These files define the innate layer. They are loaded at startup and cached. Changes invalidate the cache via file watcher and lifecycle channel — no restart required.

-----

## Hot Reload

CARL never requires a restart to apply changes. The Nervous System exposes a lifecycle channel on the event bus. When a file changes:

1. File watcher detects the change
1. Lifecycle event published to Nervous System
1. Affected Faculty unsubscribes its handlers
1. Fresh module loaded
1. Faculty resubscribes with new handlers
1. Next message routes to fresh code

No orphaned modules. No version key overhead. No process restart. The system rewrites itself while running.

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

1. Nervous System core with EventEmitter and lifecycle channel
1. Immune System basic gate with origin validation and Faculty registry
1. Relay inside Nervous System with Zod validation
1. Telegram Faculty — sensory input
1. Persona Faculty — human interface and protocol enforcement
1. Cortex Faculty — reasoning bridge with Execution Plan
1. Memory Faculty stub — flat file read/write
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
│   ├── telegram/
│   ├── discord/
│   ├── gmail/
│   ├── calendar/
│   ├── web/
│   ├── config/
│   ├── memory/
│   ├── jobs/
│   └── monitor/
├── schema/
├── workspace/
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

Samuël Tremblay  
Montreal, Quebec, Canada

-----

## License

Apache 2.0
