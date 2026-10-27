# CARL — Architecture (post-DASH refactor)

Single-surface topology. One API. One control surface.

## The Nervous System (bus)

A typed publish/subscribe bus. Every message is an `{ id, type, ... }` frame
carried on a NAMED lane. Lanes are validated — unknown lane names and
unknown frame shapes are rejected (the bus validation choke point).

Two lanes:

| lane | class | color | direction |
|---|---|---|---|
| bright | user-visible content | green | LLM → DASH |
| telemetry | self-test, counts, ms, TTFT, flow | dark/purple | any → any (per bus position) |
| dark | VIOLATIONS — NEVER appears on user-visible surfaces | none | none (structural) |

## Faculty map (post-DASH)

| faculty | file | role |
|---|---|---|
| LLM | `faculties/llm.ts` | vLLM client; publishes `llm.content.token`, `llm.done`, `llm.error`, `llm.abort`, `llm.telemetry` (its own reasoning frames + counts + ms + TTFT) |
| Cortex | `cortex.ts` | `#IDENTITY` prepend on `cortex.request → llm.request`; NO relay (the old `chat.response` forward is dead) |
| Telemetry | `faculties/telemetry.ts` | bus monitor — flow counts, `ns.bus` stats, `byId` profile ring, its own self-test subject. **Unchanged monitor logic.** |
| DASH | `faculties/dash.ts` | The ONE user control surface (SSE multiplexer, per-connection self-test, bootstrap banner, HUD) |

### Bus lane diff (before → after)

| lane | before | after |
|---|---|---|
| `chat.send` | chat faculty published | **DROPPED** |
| `chat.done` | chat faculty published | **DROPPED** |
| `chat.response` | cortex forwarded; chat consumed | **DROPPED** |
| `cortex.request` | dash→cortex (via llm.request) | unchanged |
| `llm.abort` | dash→llm | unchanged |
| `llm.content.token` | llm→cortex→chat | **llm→DASH (direct; cortex no longer forwards)** |
| `llm.done` | llm→cortex→chat | **llm→DASH (direct)** |
| `llm.error` | llm→cortex→chat | **llm→DASH (direct)** |
| `llm.abort` | llm→cortex→chat | **llm→DASH (direct)** |
| `llm.telemetry` | llm→telemetry | **llm→DASH+telemetry (DASH consumes its reasoning frames + counts)** |
| `ns.telemetry` | ns bus monitor @10Hz | unchanged |
| `dash.telemetry` | — (did not exist) | **NEW** — DASH's OWN telemetry lane (self-test evidence) |

Nothing else added to the bus.

## DASH faculty anatomy (faculties/dash.ts)

A real faculty on the nervous system. Owns:

- **SSE multiplexer** — one stream per `/dash` attach; frame types are
  JSON lines, `t`-dispatched.
- **Per-connection self-test** — re-runs on EVERY `/dash` attach
  (operator rule: "whenever the web dashboard connects, it
  retriggers the self-test").
- **Per-round state machine** — one `Map<string, DashRound>` per
  connection; slot freed on settle (the sticky-error-guard override).
- **zhang (HTTP)** — close all SSE writers on service stop; fail
  3 consecutive failed frames → backoff `5*2^n` capped 60 s.

### Frame types on /dash (SSE, JSON lines)

| frame | fields | purpose |
|---|---|---|
| `{t:'boot', m, s, ms?}` | m=TELE\|NERV\|IMMU\|CRTX\|LLM\|DASH, s=testing\|OK\|FAULT, ms=measured | self-test line settle (100 ms dot cadence, progress then OK/FAULT) |
| `{t:'ready', ok}` | attach proven; continuous tick begins | banner line 8 (`READY.`) flips to `READY.` |
| `{t:'user', id, text}` | the sent line echoes | terminal transcript user line |
| `{t:'thinking', id}` | round entered reasoning | spinner (in-place) |
| `{t:'reasoning', id, n}` | dark lane at RENDER boundary: COUNT of reasoning frames | raw text stays on telemetry lane — NEVER rendered anywhere |
| `{t:'content', id, text}` | bright lane content token | terminal transcript + spinner→marker swap |
| `{t:'done', id, status, ms, usage, inflame, outtoken}` | round closed; usage = vLLM `response.completed`; inflame/outtoken = DASH's own frame tallies (the ±1 proof) | done frame → usage HUD |
| `{t:'stats', ...}` @1Hz | ttft p90, tkr p90, completion count, per-frame token sparkline array | HUD cell 1 (TTFT P90 + CRS P90 t/s) |
| `{t:'flow', per_lane, total}` @10Hz | from the `ns.bus` monitor | HUD cell 2 (bus flow sparkline, 3 lanes, 60 frames, 28 px) |
| `{t:'vram', ...}` @1Hz | server-side poll of the vLLM pressure endpoint | HUD cell 3 (VRAM, display-only — the polled value's own label is shown) |
| `{t:'error', id, msg}` | clean per-round error (NOT a crash, NOT sticky) | next send unaffected |

### Attach order

```
GET /dash  →  SSE attach
            →  {t:'ready', ok:true}                      ← banner line: STATUS … READY
            →  {t:'boot', m:'TELE', s:'testing'}         (self-test re-runs)
            →  {t:'boot', m:'NERV', s:'testing'}
            →  {t:'boot', m:'IMMU', s:'testing'}
            →  {t:'boot', m:'DASH', s:'testing'}
            →  {t:'boot', m:'CRTX', s:'testing'}         (internal ping fires)
            →  {t:'boot', m:'LLM',  s:'testing'}
            →  {t:'flow', ...} @10Hz (from ns.bus monitor)
            →  {t:'stats', ...} @1Hz
            →  {t:'vram', ...} @1Hz
POST /dash  →  {msg:'...'}  →  {t:'user', id, text}
              →  {t:'thinking', id}
              →  {t:'reasoning', id, n} (count only — 0 frames is OK)
              →  {t:'content', id, text} (spinner → ❯ marker swap)
              →  {t:'done', id, status:'ok', ms, usage, inflame, outtoken}
              →  usage HUD updates
```

## DASH per-connection self-test

Six module lines (CHAT is dead with its faculty). In locked order:
TELE, NERV, IMMU, CRTX, LLM, DASH.

| line | sub-facts |
|---|---|
| **TELE** | (i) bus round-trip — DASH publishes a throwaway frame to a throwaway lane and confirms its OWN subscription receives it. (ii) log file — open `logs/carl.log`, append `'selftest.dash.<ts>'`, read back last line, verify own bytes present. (iii) disk — `statfs`/`df` free-space check, FAULT if < 500 MB. (iv) byId ring — read its own profile via the telemetry snapshot path (the bounded store is live; the 200-cap untouched). |
| **NERV** | (i) subscribe→emit→verify→unsubscribe full lifecycle on a transient subscription (confirm delivery, confirm zero after unsubscribe — proves the piping). (ii) fan-out — one publish, 2 concurrent subs, both get it (no loss, no duplicate). (iii) rejection probe — attempt a subscribe to a dark lane DASH is not entitled for → expect rejection; the rejection IS the pass. (iii-b) unknown-lane publish from a test publisher id → rejected at the bus validation choke point. |
| **IMMU** | (i) this connection passed the origin gate (its own existence = proof — SSstdin POST returned 403 for a forbidden Host). (ii) spoof probe — DASH's own test client sends ONE request with a forbidden Host and expects 403 (structural rejection, 403 = pass). |
| **CRTX** | The first real message round-trip on this connection proves the chain (DASH → cortex → bus → LLM → back). On attach, DASH fires exactly ONE internal micro-request (a ~1-token `'ping'` — cost ~a dozen tokens; the operator accepts this as the price of a per-connection health check). CRTX OK when the response frame arrives + the log shows the request frame (log-grep the line is the proof the chain logged, not just the reply). |
| **LLM** | During the SAME round-trip, verify BOTH frame classes observed (content delta + reasoning delta if the model emits a reason frame — Qwen3.8 hybrid: 0 reasoning frames is OK). DASH tallies its own inflame + outtoken from observed frames; `response.completed` usage must agree (±1) — mismatch = FAULT. |
| **DASH** | Memory form bounded per the existing dstructs: per-connection state GC-ed on close + 30s cap (reviewer leak #2). zhang: SSE writers healthy, backoff armed. |

FAULT semantics: a FAULT line gets **ONE auto-retry after 1.5 s**. A
second FAULT settles — the SSE header does NOT flip to PASSED.

The DASH line on the banner (the 6th row, shown by the WEB-UI side) is the
client-side self-test: xterm rendered, fit addon measured, input focusable,
AND the SSE stream already delivered ≥ 1 frame by READY.

## The web-ui (single-surface client)

One SSE stream. The SPA attaches to `/dash` on load, dispatches by frame `t`.
The xterm terminal is the TRANSCRIPT + the BOOT BANNER + the prompt.
The 3-cell live strip below is bound to the stream:

| cell | bound to | shows |
|---|---|---|
| TTFT P90 ms + CRS P90 t/s | `{t:'stats'}` @1Hz | ttft p90 + completion count + tkr p90 (tokens/sec) |
| bus flow sparkline | `{t:'flow'}` @10Hz | last 60 frames, 3 stacked/1 overlay per lane, ~28 px height |
| VRAM | `{t:'vram'}` @1Hz | vLLM pressure endpoint poll (server-side; client renders only) |

The three cells are LIVE from READY onward, mounted for the whole session —
"listening to the engine" — independent of chat activity.

### Boot banner (prints INTO the terminal — existing printBanner slot)

```
  CARL ─ PROVISIONING TERMINAL  v0.1.0
  cognitive autonomous recursive learning system
  ROM <computed-by-git> · MEM <live-heap>
  ── SELF-TEST ─────────┐
                        │   ← line 1..6: module rows (see below)
  > TELE ............ OK * 23ms
  > NERV ............ OK * 11ms
  > IMMU ............ OK *  4ms
  > CRTX ............ OK * 289ms
  > LLM  ............ OK * 312ms
  > DASH ............ OK
                        ┘
  SEQUENCE seq · GATE hermes,127.0.0.1 · LINK 10.240.232.32:8000
  STATUS … READY
  R E A D Y .
❯ _
```

The frame height is 12 lines (title, subtitle, ROM/MEM, header, 6 module
rows, ready, sequence, status, blank, READY, prompt). It is
bottom-hugged via the existing `seedPad` mechanism.

Module row anatomy (single-width chars only — the frame's length is
guarantee-aligned; overflow is truncated at the viewport's measured width,
border never stretches, no glyph reflow):

```
  > <4-char label> <12 dots> <5-char status> [ * NNNms]
```

- `…` = pending (no dots)
- `OK` = settled (dots → OK, `* NNNms` suffix, NN = zero-padded 2-digit ms if < 100)
- `FAULT` = faulted (no suffix; header does NOT flip to PASSED)

## The CLI and the dark lane

`cli/carl` hosts the same web surface. It does NOT create a second
proxy. It calls `/dash` directly on the same origin — the DASH faculty is
the single control surface. The CLI's `printFrame` switch accepts all
the same frame types as the web-ui; it dispatches by `t` the same way the
`Chat.svelte` module does.

### The dark lane — structural HOLD

The LLM faculty publishes to `llm.telemetry` with reasoning frames
(`{ id, state:'reasoning', text, n }`) — the reasoning text is on the
TELEMETRY lane, continuing the existing pattern where the LLM faculty
publishes its own telemetry.

DASH consumes `llm.telemetry` at its granted bus position and, when it sees
a reasoning frame, it:
1. Increments its own `reasoningFrames` counter
2. Sends `{t:'reasoning', id, n}` to the client — the **COUNT** only

The raw reasoning text is NEVER forwarded to `/dash` — it stays on the
telemetry lane where only the telemetry faculty and DASH's own
self-test can see it. The DASH faculty holds the HOLD: it renders the
count, not the text.

## The five artifacts

| artifact | path | status |
|---|---|---|
| A. 7-probe server test | (this round: to be landed) | — |
| B. Stub screenshots S1–S5 | (prior-round stubs, font stack preserved) | — |
| C. Live service test | (`GET /`, `/dash` stream, identity round-trip) | — |
| D. git build/commit/push | (this round) | — |
| E. systemctl --user restart carl | (single restart, verify) | — |
