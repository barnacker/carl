# SELF-TEST ARCHITECTURE — SPEC

**Locked architecture. Written 2026-11-20 with operator. Source: operator verbal spec + spec-verification pass against README.md, SPEC.md, TESTING.md, docs/build-stages.md.**

## The Immune System

The Immune System is the ultimate interface of all faculties. Its jobs:

1. **Origin certification** — validate who a faculty is and where it came from. (Existing per spec §3.)
2. **Self-test enforcement** — request a self-test of any faculty it manages. Gate bus access by result.
3. **Prompt-injection blocking** — prevent prompt-injection payloads from circulating. (FUTURE within self-test, not phase 1.)

The Immune System does not self-initiate self-tests on its own schedule. It runs them **when asked** (by the backend after a client connection, per below).

## Who can invoke a self-test

**Only the backend (server) can trigger a self-test sweep.**

- The **WebUI client** does NOT invoke self-tests. It only connects and receives the first frame (ACK with version + boot state). Every subsequent self-test is server-driven.
- **Other faculties** do NOT invoke self-tests on themselves or each other after boot. They trust the periodic results.
- The **Cortex** stays out of the self-test loop — its own health is verified by the Immune System when *it* goes to ask for something, not by self-declaration.

## The Bootstrap sequence (WebUI connects)

Step by step, after client connects:

1. Client connects → server sends **ACK frame** (version, boot state). This is the first `kd` entry the client sees.
2. Server **checks if a self-test was run recently** (time-window, see Throttle below).
3. If none within window → server **triggers the dashboard self-test** (backend, not frontend). The WebUI (dash faculty) runs its OWN test.
4. After dashboard self-test completes → server **asks Immune System for the global self-test sweep** (all faculties).
5. Server **waits for sweep to complete** (or a timeout, not implemented phase 1).
6. Server **sends the client self-test result** back to the connecting client (via a `tx` frame, shape TBD).
7. Client renders the result (shield line — TBD design, not in this spec).

**The client only ever saw: connection → ACK frame → (self-test result frame).** It did not initiate any of the tests.

## Self-test lives

| Test | Where | Who runs it | Who reads it |
|---|---|---|---|
| **Boot self-test** | `carl.boot.selftest.*` keys | Backend, on process start | Dashboard UI (internal state, operator view) |
| **Dashboard self-test** | `carl.selftest.*` keys | Dashboard (WebUI backend), on first client connection | WebUI client renders only when `trigger_type === 'client'` |
| **Global self-test** | `carl.selftest.sweep.*` keys | Immune System, on backend request | Subordinate faculties + WebUI (latter reads `overall` status only) |

Boot result is **NOT** rendered by any client. It is recorded for audit.

## Throttle — time window

The server tracks `lastSelftestTs` (timestamp of most recent global self-test completion).

```
On client connect:
  now - lastSelftestTs <= TTL:
    → return cached result. No new sweep.
  now - lastSelftestTs > TTL:
    → run sweep. Store result. Return result.
```

All clients within the same TTL window get the same result. The trigger state (idle/running/done) is **per-connection** — each client just waits and polls (or receives a push) while the sweep runs. `TTL` is a compiled constant, not config.

## Self-test result — tree shape

Root: `carl.selftest`:

```
carl.selftest
  status: "idle" | "running" | "done"
  started_at: ms | null
  completed_at: ms | null
  trigger_type: "boot" | "client"
  overall: "pass" | "degraded" | "fault"
  rungs:
    carl.selftest.rung_0
      target: "dash"
      status: "active" | "pass" | "degraded" | "fault"
      result: (see below)
      ms: <number>
    carl.selftest.rung_1
      target: "immu"
      ...
    carl.selftest.rung_2
      target: "crtx"
      ...
    carl.selftest.rung_3
      target: "tele"
      ...
    carl.selftest.rung_4
      target: "nerv"
      ...
    carl.selftest.rung_5
      target: "llm1"
      ...
```

Per-rung result object (TBD — exact keys locked later):

```
result:
  pass: boolean
  details: <array of checks, each {name, ok, ms}>
  errors: <array of {code, msg}>
```

`trigger_type` distinguishes boot from client. Client only renders when `trigger_type === 'client'`.

| Check | What it's actually testing |
|---|---|
| HTTP ACK received within X ms | Server is alive, network path works |
| HTTP ACK payload parses (version, schema) | Server speaks the right protocol |
| No malformed bytes in the wire | Transport integrity |
| **SSE channel** holds for regular frames | Steady transport path is alive |
| **WebSocket channel** opens and holds | High-frequency telemetry path is alive |

## Dash transport model

| Path | Role | Notes |
|---|---|---|
| **HTTP** | Baseline. ACK lives here. | Must always work. |
| **SSE** | Regular frame stream (version, kd, self-test result). | Simple, HTTP-native. |
| **WebSocket** | Live telemetry, when implemented. Zero-latency event stream. | Fallback: SSE carries telemetry when WS is blocked. |

The dash self-test is a **transport negotiation test**, not a single handshake. It checks all three paths.

**Degradation model — individual transport failures are `degraded`, total failure is `fault`:**

| Transport state | Overall |
|---|---|
| HTTP + SSE + WS all alive | `pass` |
| HTTP + SSE alive, WS blocked | `degraded` — SSE carries everything |
| HTTP + WS alive, SSE failed | `degraded` — WS carries everything |
| HTTP alive, both SSE and WS blocked | `degraded` — HTTP only, no streaming |
| HTTP fail | `fault` — dashboard receives nothing at all |

Only a total transport failure is `fault`. One transport down means the dashboard is alive but less efficient.

**Client-vs-server split:**
- **Client-side**: verifies ACK arrived and parsed, SSE/WS channels hold.
- **Server-side**: records the result into the tree so the Immune System can gate bus access.
- Client reports the status. Server writes it. Immune System decides.

## What each faculty's self-test checks

**TBD per faculty.** Each faculty defines its own standard procedure. Not specified in this document. The contract is only the shape of the result object (above). Each faculty defines what "ready to talk to the nervous system" means for *it*.

## What is explicitly OUT of scope (phase 1)

- Prompt-injection scan within the self-test → **FUTURE phase.**
- Multiple concurrent self-test sweeps → one at a time, later ones queued, queue depth TBD.
- Rate limiting / doS protection on the connect path → **separate defect, not part of self-test.** A simple `lastConnectTs` per source IP can handle it in a separate commit.
- The shield-line UI rendering of the self-test result → **TBD design** in a separate spec doc once the tree shape is locked.
- Rerunning the self-test for a second client within the same TTL → not supported; they ride the cached result.

## What is in scope (phase 1)

- Server-side self-test runner (separate from test runner currently at `faculties/tree.ts:runSelftest` — this was a prototype; see rework below).
- ACK frame (already exists, unchanged).
- Time-window throttling (`lastSelftestTs` + `cachedResult`).
- Dashboard self-test on first client connect.
- Global self-test sweep (Immune System) after dashboard self-test passes.
- `trigger_type` field in the result.
- Boot self-test — unchanged, still runs on process start, writes to `carl.boot.selftest.*`.

## Relationship to existing code

The current prototype's `runSelftest()` at `faculties/tree.ts:L254-275` is a **client-side init frame running a mock sweep**. It is being reworked to match this spec. The server-side trigger is the client-connection handler in `main.ts`, NOT a client-side event handler in `App.svelte`.

## UNIMPLEMENTED — pending operator sign-off

- Exact TTL value (30s? 60s? operator decision)
- Per-faculty self-test procedure (each faculty to write its own spec)
- The `tx` frame shape for carrying the result back to the client (probably `{ t: 'tx', data: { op: 'selftest_result', trigger_type } }` — to be locked)
- Shield-line rendering spec (separate doc)
- Concurrent-sweep queue depth
- Whether a failed rung halts the whole sweep or lets other rungs continue (operator decision)
