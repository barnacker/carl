# README Restructure — v2 FROZEN (applied 2026-10-20)

STATUS: **APPLIED** to README.md (1036 → 223 lines, commit pending as of writing). This file is the audit trail for what was decided in the operator review stream, not a live proposal.

House style: plain, compact, team-readable. One path. No coined jargon. Table over nested bullets. Every section must earn its length.

## The framing problem (why the old README lost the reader)

Old README opened with: security-claim disclaimer, biology-naming disclaimer, a reading map, a 9-row comparison table, 3 anticipated objections, then a taxonomy of two inhibition words — before the reader knew what CARL does with a message. The Arc (the defining object) appeared at line 231 and was re-explained three times; no end-to-end signal-flow story existed.

Fix applied: open with what CARL is, THEN the Arc as §1 (the tracker), then one message end-to-end, then the components the path runs on. No glossary. No comparison table.

## Locked decisions (operator, review stream 2026-10-20)

- **Opening** = original first paragraph, trimmed: persistently/safely/improve + "Don't see it as a new Agent, but rather a new modern harness to drive real work and deliver real cost savings" + the separation sentence + Biological Focus / Competitive Inhibition / Temporal Decay tail. NO security-claim disclaimer paragraph, NO naming-convention paragraph in the README (moved to SPEC preamble if needed). NO comparison table.
- **§1 "The Arc"** = first chapter. Tracker definition + story-arc/TV notice + 5 states table (INCUBATING / ENGAGED / INHIBITED / RESOLVED / ABSORBED) + budget line + Plan maturity + No state to save + rework-accuracy paragraph + interruption hook ("CARL may forget to finish something because you interrupted him… CARL remembers the request, it was just busy" + inhibition is cost control — sheltered, full context on re-entry).
- **§2 "The principle"** = one sentence ("Only Cortex tells. Faculties execute. The Nervous System is the only path between components.") + 3 bullets (gate / plug-in / decision≠doing with attention-arbitration four-choice) + the 12 Laws one-line each + enforcement-map pointer to SPEC.
- **§3 "One message, end to end"** = ASCII flow (Sensory → Immune → Reflex check → Cortex/router → Gating → Faculty via Synapse → Synthesis Gate → hand back) + 6 component paragraphs in diagram order + "Why the hand comes back fast" (safely-yield, four choices, temp, ABSORBED).
- **§4 "Nervous system"** = light intro + Immune / Relay / Dark Lane bullets.
- **§5 "Faculties"** = pattern + 3 categories + SEB paragraph (13-step, step 11 operator) + Memory Faculty 3-tier table + semantic index one-liner + "flap slowly" note.
- **§6 "Building CARL"** = 5 stages, MVC = 0+1+2, stage matrix table (kept verbatim from old README), one-line-per-stage, phases A/B/C.
- **§7 "Where things live"** = path table (SPEC / cortex-persona-arc / build-stages / TESTING / CONTRIBUTING / plans) + repo top-level + scope statement (compressed) + CARL acronym note + author/license.

## Content moved out of README

| Old README content → | destination |
|---|---|
| Security-claim + biology-naming disclaimer (old lines 5–7) | SPEC preamble (when SPEC is rewritten) |
| Comparison table (9 rows) | out (SPEC §Positioning, optional) |
| "Step toward GI" 5-row precedent table | out (SPEC §Positioning, optional) |
| Anticipated objections (3) | DROPPED (never real — killed at proposal) |
| Recursive loops (6) | out — left cover; README keeps the cost argument in §1 |
| Inhibition model (competitive/lateral) | SPEC §Inhibition (README keeps the cost-control definition in §1) |
| Law enforcement map | SPEC (verification artifact) |
| PRIME Directives block | SPEC (README: 1 line in §4 + scope statement) |
| Cortex internals diagram, Persona loop diagram, ambiguity example block | SPEC §Cortex |
| Boot protocol, compressed-intent schema, full reasoning-engine section | SPEC |
| Memory Faculty full (crystallization, 1a properties, 5 vector constraints, defense) | SPEC §Memory (README keeps 3-tier table + one line) |
| Optimization pass full | SPEC (README: 1 line in §6) |
| SEB full (13-step lifecycle, threat model, 8-row table) | SPEC §SEB (README: 1 paragraph in §5) |
| Dark transit full (blind fetch/write, courts-by-default, lift protocol, ex-fil) | SPEC §Dark Transit (README: 1 bullet + 5 pointer) |
| Synapse interface + TraceEvent schema | SPEC (README: 1 line in §3+§5) |
| 5 stages full detail (claims, falsification, proof-of-life, ~130 lines) | `docs/build-stages.md` — **TO BE CREATED** (trailing ToDo) |
| Stack table, workspace seeds, config files table | SPEC / architecture appendix |
| Naming reference (35 rows) | SPEC §Naming (README keeps the CARL acronym note) |

## Vocabulary rules (standing)

- **Banned / killed (this user, standing)**: "multi-tasking", "auto-heuristic tier", "agent layer", "story-staff", "inhibition festivity", "dispatcher tell", "attention arbitrator", "frequency lock", "recall" as a *do-THIS* sentence (only "does not recall / just busy" negatives), "Journey as concept", "Quartus", "Dispute Coordinator", "AF/LIB/state-emoji framing", all **saliency** phrasing ("scored on salience", "salience sweep" → "loop-of-thought scores them"); all "flash" / "burst" / "pick-or-shoot" words.
- **Allowed (operator-approved)**: "harness" (operator-facing prose), "curate (in arc-store)" etc. (working-model verbs), "story arc / TV notice", "tension", "episode", "dispute" (careful: not the deleted 4b), "seat", "floor" (careful — "win the floor" is the operator's own word), "identity", "associated", "trust gradient", "key pair", "pairing files". And always: plain prose in code/commits/specs (T-800 voice is chat-only).
- **Arc states never renamed**: INCUBATING / ENGAGED / INHIBITED / RESOLVED / ABSORBED. Plan maturity: UNDECOMPOSED → PLANNED → EXECUTING → RESOLVED.
- **Law 3 frame** (origination vs execution of decision policy) stays intact — Faculties do not re-derive; Reflex only re-runs.
- **Dark Lane** = model-invisible transit. Never described as "recall".**
- **BANNED repo terms**: "session", "SessionStatus", "session id", persisted `OPEN`/`ACTIVE` arc states, "persisted ENGAGED".
- **Repo rules**: master branch only, no PRs, straight commit + push; build + test gate after change (36 tests); docs/plans/* = proposal non-approval for implementation.
- **Master-copy** (final 09-12): every project CARL-02 maintains gets a GitHub master copy.

## Trailing TODO (before taking SPEC work)

1. **`docs/build-stages.md`** — per-stage claims, falsification, proof-of-life, added-specified lists (from old README lines 687–820). Trailing read in §6 points at it — file must exist or the pointer is dead.
2. **SPEC.md wholesale update** — ~1140 lines, author's domain. Plan: one planning pass, one doc move, review stream. To include: authority lattice + source/facility table, reflex poisoning size, dark-travel protocol, memory tier detail, SEB 13-step lifecycle + threat model, per-stage proof-of-life, semantic-index 5 constraints, optimization pass + longitudinal educance metric, law enforcement map, PRIME block, stack/workspace/config tables, naming reference, compression intent schema, full cortex internals, boot protocol, treatment model taxonomy (competitive/lateral), anticipated objections if kept, security-claim + naming disclaimer.
3. **One cursor check-in with the user** before the SPEC pass: "does the target structure match your intent?" — one message, not five.

## Where this does NOT touch

- `docs/cortex-persona-arc.md` — Arc derivation, Wallas mapping, INV-ARC-1..9. Canonical for Arc; README §1 pointer matches it.
- `carlspeech` repo — frozen voice archive; the old 2026-06-18 README word-stroke table stays there.
- `TESTING.md` / `CONTRIBUTING.md` — the restructure does not edit them.

## Verification (performed 2026-10-20)

1. `npm run build && npm test` green (36 tests) — to run in the final commit.
2. New README = 223 lines (measured).
3. Banned-vocabulary grep = zero hits in README — to run in the final commit.
4. Named-orphan scan (named in README, no definition anywhere) = zero — to spot-check in the SPEC pass.
5. `git log / git show --stat` post-commit; push master direct.
