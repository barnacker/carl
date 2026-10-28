# Char-Band Wire — Provisioning Terminal v0.1.1

Reconstructed spec. Requirement source: the operator-locked screen below
(operator-locked 2026-10-27); behavior source: the live code at
/root/carl @ d269733 (verified symbol-by-symbol where a name is named).
This file supersedes every older frame-grammar comment in
faculties/dash.ts (those long header comments predate this design).

## 1. Locked Screen

```
CARL · PROVISIONING TERMINAL v0.1.1

- SELF-TEST -----------------------
> DASE .... OK * 04ms
> TELE .... OK * 12ms
> NERV .... OK * 55ms
> CRTX .... OK * 210ms
> LLM1 .... OK * 300ms
-----------------------------------
ROM 345k · MEM 77MB
READY.
```

The block is transcribed verbatim from the operator's locked screen. Every
number in it (345k, 77MB, 04/12/55/210/300ms) is LOCKED as a requirement;
the code's current anchors are documented separately in §3–§5. Reconciling
locked-vs-actual is the job of the fix round (see §6 KNOWN DEFECTS).

## 2. Element Contract

Per element: string, width, units, source, settle rule. All banner text is
server-owned (typed by faculties/dash.ts); the client renders the stream,
it does not paint a template.

### Title
- String: `CARL · PROVISIONING TERMINAL v0.1.1` — middle-dot separator
  (U+00B7), version FIXED at 0.1.1. No macro, no placeholder, no client
  version constant.
- Code anchor: `BANNER_TITLE` (faculties/dash.ts), built from
  `BANNER_VERSION = 'v0.1.1'` (verified). Line 1 is always CRLF-terminated
  on the wire (T_NL = "\r\n").
- Source of truth for the version: the server. The web client's
  `DISPLAY_VERSION` (web-ui/src/lib/boot-consts.ts) is 'v0.1.0' and is a
  dead export — do not rely on it for the displayed version.

### SELF-TEST header
- String: `- SELF-TEST ` + 23 × U+002D (a dash run), so the line is
  `- SELF-TEST -----------------------` (13 label cells + 23 dashes,
  35 code units end-aligned with the title's last char).
- ONE blank line precedes the header (a blank line after the title, BEFORE
  the header row) — as in the locked screen.
- Code anchor: `BANNER_SELFTEST_ROW = '- SELF-TEST ' + '-'.repeat(23)`
  (faculties/dash.ts, verified).
- Layout defect: the code currently emits the header directly after the
  title line with NO intervening blank line, and the in-code comment
  claims the dash run is "30" while the constant is 23. The reconstruction
  pins the constant: 23 dashes. The blank line is a LOCKED requirement the
  code does not meet — tracked in §6 (D3).

### Module rows (5, fixed order)
- Codes, exactly these five, in this order: `DASE`, `TELE`, `NERV`, `CRTX`,
  `LLM1`. They are DISPLAY codes only (terminal-collated subject names);
  no pin or hardware meaning is implied or documented here.
- The code's module keys are `DASH`, `TELE`, `NERV`, `CRTX`, `LLM1`
  (`DashBootModule` / `DASH_BOOT_MODULES` in faculties/dash.ts; fixed IMMU
  order `IMMU_LEG_ORDER` in faculties/immune-system/boot.ts — verified).
  The locked screen's first-row code `DASE` is the display spelling of
  that first leg; the code renders the key as-is. See §6 (D3).
- Row shape (locked, byte-exact on the code's dot band):
  `> ` + label (4, padEnd) + 2 spaces + 12-dot field + 2-col boundary,
  then the state zone. The dot is U+00B7 (`T_DOT`, verified).
- Dot rule: the field capacity is 12 (= 100%). ONE dot per progress tick;
  the active dot count at any moment = `round(pct/100 × 12)`, where pct is
  the leg's progress 0-100 (the sole dot driver is IMMU's pacer,
  `selftest.progress` events — verified in IMMUSequencer, PACE_MS = 50).
  Rows that settle under 100% keep whatever dots were earned at settle;
  the settle repaint overwrites the 14-col zone
  (2 boundary + 12-dot field) in place via backspace×14
  (`T_ZONE_ERASE`, computed from the armed skeleton — verified).
- Settle (per row, CRLF terminates the row — no other linefeed until the
  next row):
  - OK: `  OK * NNms` — exact code: `T_OK` = `'OK * '` + ms, ms =
    `Math.min(999, ms)` zero-padded to 2 digits (`padStart(2,'0')`), then
    `'ms'` (faculties/dash.ts, verified). 2-digit is the operator-locked
    form (the DASH leg floors its ms at 10 in `probeDash` so the lock's
    `04ms`-class literal cannot 3-digit-overflow on the common path).
  - FAULT: the status word `FAULT` ONLY on the band (`T_FAULT` = `'FAULT'`
    — verified). No em-dash, no detail string, no retry text on the row
    (operator-locked; the detail lands in the probe ring /
    dash.telemetry lane, never on the wire). The locked screen's
    `FAULT — <detail>` reading is superseded by the code's status-word
    rule; the code's word-only form is what the fix round must hold.
- Retry continuation (IMMU-owned): an attempt-1 fault re-invokes the
  probe (IMMUSequencer advanceLeg — verified). The second attempt's
  settle repaches the same row (`\b`×14 + state + CRLF — the settled row
  IS the final state; the visible timeline never shows a second fault
  for a leg that recovers on attempt 2). The operator-locked retry
  continuation marker ` · retry · ` (between the two settles) is a LOCKED
  REQUIREMENT the current paint does not emit — the code repatches the
  row as the attempt-2 verdict. See §6 D3(5).
- Linefeed discipline: a single CRLF is emitted ONLY after the final
  verdict of a row; the row's CRLF is owned by the settle repaint
  (`paintSettledRow`: `\b×14` + state + T_NL — verified).

### R-S narrative row, separator footer, ROM/MEM, READY, prompt
- R-S row (below the five module rows, above the footer):
  `R-S PENDING ◌ SYSTEM BOUND ` (eye U+25CC open) while the band is
  pending; at band-complete it repaints EXACTLY ONCE to
  `R-S RESOLVED ⬤ SYSTEM BOUND ` (eye U+25CE) on all-OK, or
  `R-S SCANNING ◌ SYSTEM BANKRUPT ` on any FAULT. The rewind is
  backspace×27 (`T_RS_REWIND = [...T_RS_PENDING].length` — verified).
- Separator footer: a `-` run of 32 (U+002D) — code: `'-'.repeat(32)`
  in `attachTapePaint` (verified).
- ROM/MEM row: `ROM <value> · MEM <value>` — `bannerStatsRow()`
  (verified); sources and units in §4.
- READY: bare `READY` followed by `.`, i.e. exactly `READY.` — locked,
  and matching the code (`BANNER_READY_ROW = 'READY.'`, verified).
- Prompt (final byte of the attach paint, no trailing CRLF): the block
  cursor U+2588 (`T_PROMPT`, verified — decision 15; supersedes any
  `'❯ '` glyph).

### Round rows (post-boot tape)
- on send (echo): `'« ' + msg + CRLF` (verified: `handleSend`
  types it ONLY when `s.band.settled` — during boot the module rows own
  the tape, so a send mid-boot is state-only, no echo). If the send
  supersedes an in-flight boot ping (CRAA): the ping row is settled at
  the adopt, `{t:'err', code:'PING_SUPERSEDED'}` rides the data side, and
  the user round continues.
- done ok (user round): `'· ' + ms + 'ms | IN ' + inflame + ' / OUT ' +
  outtoken + CRLF` + prompt (verified in the post-boot user-round settle
  in settleRound; ms = the user round's measured round ms; lands only
  after the band is settled).
- err (user round terminal): `'ERR ' + status + CRLF + prompt` (verified;
  status = 'fail' | 'aborted') plus the control-frame `{t:'err', id,
  code, msg}` on the data side (`LLM_ERROR` / `ABORTED`; payload-side
  errors `BAD_PAYLOAD` / `EMPTY_MSG` arrive as `{t:'err'}` only).
- Reasoning spinner and content relay: see §5.

## 3. Channel Contract

### SSE tunnel (the /dash surface — main.ts, verified)
ONE multiplexed surface. Attach: `GET /dash` (EventSource-style
fetch-stream of `data: <json>\n\n` lines, `t`-dispatched). Send:
`POST /dash` with body `{msg, session}` (canonical `msg`, compat `text`);
the POST echoes the attach tag in header `x-dash-session`; the POST
returns `202` with `{ok:true, stream:'/dash'}` — a mere RECEIPT; the
visible output rides the open SSE stream (GET), never the POST. The
retired chat surface `POST /chat` and any other `/chat` is `410`
(verified in main.ts) — see the D1 defect in §6 (the retired chat.* junction).
Origin gate: `isAllowedHost` (DASH_GATE_HOSTS = 127.0.0.1, localhost,
hermes) 403s foreign Host on every /dash attach, /telemetry, static, GET
/version.

Frame types (verbatim, from faculties/dash.ts send sites — verified):
| frame | shape | notes |
|---|---|---|
| `sseinit` | `{t:'sseinit', session, tag, host, gate}` | first frame on attach; `tag` is the connTag the POST echoes back via `x-dash-session` |
| `ready` | `{t:'ready', ok}` | attach settled; stats/flow/vram ticks + self-test begin |
| `chars` | `{t:'chars', c}` | THE only visible frame: c ≤ 32 code units per frame |
| `stats` | `{t:'stats', ...}` | @1Hz aggregate (TTFT p90, tokens/s p90, completions, sparkline) |
| `flow` | `{t:'flow', per_lane, total}` | @10Hz from ns.telemetry (per-lane msgs/s) |
| `vram` | `{t:'vram', ...}` | @1Hz server-side poll of the vLLM pressure endpoint (read-only) |
| `err` | `{t:'err', id?, code, msg}` | clean per-round error (not a crash, not sticky) |

Removed from the wire (all carried client-side machinery is deleted):
`banner`, `boot`, `user`, `content`, `thinking`, `reasoning`, `done`.

### Self-test channel: immu.selftest
Channel: `immu.selftest` (bright lane). SOLE producer: the IMMU boot
sequencer (`IMMUSequencer.pub`, private, default channel `'immu.selftest'`
— faculties/immune-system/boot.ts, verified). Subscribers: the DASH
faculty (`onImmuSelftest`, the SOLE tape interpreter, subscribes with
owner `'dash'` — faculties/dash.ts, verified) and the telemetry faculty
(lane observer, telemetry only). IMMU is the SOLE timing owner: pacer
(PACE_MS = 50) is the only thing driving `selftest.progress`; probe
closures never call `rep.report`.

Event contract (exact event strings, verified on the IMMU pub sites, all
carrying a monotonic `n` (=== seq, persisted to ~/.carl/selftest-state.json)):
| event | shape | meaning |
|---|---|---|
| `selftest.start` | `{n, module, session, t0, attempt}` | a leg opens (attempt 1) |
| `selftest.progress` | `{n, module, pct, session}` | dotted progress 0-100 (pacer-driven) |
| `selftest.done` | `{n, module, ok:true, ms, session, attempt}` | leg settled OK |
| `selftest.fault` | `{n, module, ok:false, ms, reason, detail, session, attempt[, backstop]}` | leg fault (reason e.g. `deadline`; detail stays off-band) |
| `selftest.complete` | `{n, session, ok, ms_total, legs[, reason]}` | sequence finished |
| `selftest.ignored` | `{n, module, session, reason:'leg_settled', original_n}` | telemetry-only; a settle-after-settle — the interpreter ignores it (no double render) |
| `boot.refused` | `{n, reason:'busy'\|'auth', source_session[, eta_ms]}` | in-flight lock (one sequence per process); `busy` → the attach renders the live tail (BUSY row) |
| `dash.ext.done` / `dash.ext.fault` | `{module:'CRTX'\|'LLM1', ms}` / `{module, reason, detail}` | DASH publishes these ONTO `immu.selftest` as external CRTX/LLM1 settle inputs; IMMU's `wireExternal` route converts them to `selftest.done`/`selftest.fault` at the sole settle authority |

### Leg table (module codes → probe body / settle source)
Only verified symbols are named. ⚠ marks a leg whose settle route can
hang on the KNOWN DEFECT D1 (a settle wait on the retired chat.* channels).

| code (locked / code key) | probe closure (faculties/dash.ts) | probe body | settle source |
|---|---|---|---|
| DASE / DASH | `probeDash` | 6 internal checks: probe ring ≤ `DASH_PROBE_RING_CAP` (128), idle cap intact (30s), zhang writer armed (failStreak < 3), own `telemetrySnapshot()` byId ring reachable; ms floored to 10 | `rep.done(ms)` in-probe → `selftest.done` |
| TELE | `probeTele` | (i) bus round-trip 1/1 on `llm.telemetry` (one hidden 300ms retry on 0/1); (ii) log append + readback of own tag in last 50 lines of the log; (iii) free space ≥ `DASH_DISK_FLOOR_BYTES` (500 MiB) via statfs; (iv) byId ring snapshot | `rep.done(ms)` in-probe → `selftest.done` |
| NERV | `probeNerv` | subscribe→emit→verify→unsubscribe lifecycle (zero after unsubscribe); fan-out (1 publish, 2 subs, both get it); dark-lane subscribe rejection; validator rejects a malformed `llm.done` before any listener | `rep.done(ms)` in-probe → `selftest.done` |
| CRTX | `probeCrtx` | exactly ONE internal micro-request (`ping` prompt, max_tokens 16, temp 0.1) on `cortex.request`; rides the LIVE session's round | the round's own frames: `settleRound` → `interpCrtxSettle` → `dash.ext.done` (OK on a content-carrying done) or `dash.ext.fault` (round-closed) → IMMU → `selftest.done/fault` — ⚠ hangs if the round never closes on the retired chat.* junction (D1) |
| LLM1 | `probeLlm1` | rides the same ping round; usage convergence: the LLM facade's `llm.telemetry` done-frame usage must agree with DASH's own frame tally (±1); an in-flight CRAA adopt settles OK at 0ms | round's `response.completed` usage → `onPingUsage` → `dash.ext.done/fault` → IMMU → `selftest.done/fault`; backstop = the 4s leg budget timer — ⚠ see D1 |

IMMU per-leg budgets (verified, `IMMU_LEG_BUDGET_MS`): DASH 3000, TELE 3000,
NERV 3000, CRTX 2000, LLM1 4000; hard backstop `IMMU_BACKSTOP_MS` = 15000
(the SOLE terminal failure publisher).

### GET /version
`GET /version` serves the baked service version:
`{version: BAKED_SEMVER, surface: 'dash'}` (main.ts, verified) — the CLI
queries it to learn the service version. The served version is the
`BAKED_SEMVER` constant ('0.1.0' — verified), which is NOT the banner's
`BANNER_VERSION` ('v0.1.1') — the two disagree and the banner version is
the operator-locked display authority. Reconcile in the fix round.

## 4. ROM / MEM Measurement

### ROM — locked intent (REQUIREMENT)
`ROM <value>k` — ROM = total size of the CARL project files on disk,
displayed as an integer `k`. The locked screen shows `ROM 345k`. The
intended source is a LIVE per-boot diskwalk of the project working tree
(tracked source; excluding node_modules, build/dist output, lock files,
cache, logs — the exclusion set the current build-time measurer already
uses); the value is captured once at boot and shown per attach. The
numeric lock (345k) is a REQUIREMENT to hit in the fix round; today's
baked artifact value is NOT it (below).

### ROM — today's behavior (fact)
- Build-time baked: `web-ui/scripts/measure-rom.mjs` iterates
  `git ls-files`, sums bytes (excluding node_modules/build/dist/
  .svelte-kit/.vercel/.cache/logs/.git and lock files), writes
  `romBytes`/`romKiB` into `web-ui/src/lib/boot-consts.json`.
- Current artifact: `romBytes: 848595`, `romKiB: 828.7` (tracked at
  d269733 — verified; i.e. ~828.7 KiB ≈ 0.8 MB today, not 345k).
- Server read: `BANNER_ROM_TEXT` (faculties/dash.ts) reads
  `boot-consts.json` once at module load, best-effort:
  `romKiB ?? romBytes/1024`; renders `NNN.NMB` (if ≥1024) or
  `NNN.NKiB`; on ANY read/parse failure it renders `n/a`
  (verified). So a runtime CAN show `ROM n/a`.
- Consequence: today's ROM is a STALE build-time constant, not the
  locked live diskwalk, and it is not `k`-succixed. Tracked as §6 D2.

### MEM (locked = current)
`MEM <value>MB` — the CARL Node server process RSS, in MB, one decimal.
Source: `bannerMemText()` (faculties/dash.ts, verified):
`process.memoryUsage().rss` (the Node server's resident set — NOT the
browser's JS heap; the operator diagnosis that performance.memory was the
wrong subject is encoded in the code). The code's display rule is
`KB/1024 → 1-decimal MB` (with a sub-1MB KiB fallback), i.e. e.g. `77.1MB`;
the locked screen's `77MB` is the operative reading of "one decimal, MB"
at that moment (integer-valued decimal). Unit/subject are correct today;
only and the integer k-suffix form on the ROM side is a gap.

## 5. Pacing & Relay

- Cadence: character-by-character, bounded by two locks: ≤25 Hz and
  ≤32 code units per frame (the server-side chunking cap). The code
  implements the bound with a per-session 50ms interval that drains ONE
  ≤32-char `{t:'chars'}` frame per tick (`type()` in faculties/dash.ts —
  verified), i.e. a real 20 Hz rhythm that satisfies the ≤25 Hz lock
  (recorded as a code note, not a defect: headroom, not a violation).
- Client relay: stateless. The ENTIRE visible path is
  `if (frame.t === 'chars') term.write(frame.c)` (web-ui/src/lib/Chat.svelte
  — verified; xterm owns the screen buffer exactly like a real TTY).
  NO client-side typewriter, no CUP, no row map, no partial, no seed
  rows, no client echo, no client spinner, no client dot timer, no row
  model. The server only types; it never knows or touches the column.
- In-band control bytes (plain characters inside c):
  - `\r\n` (T_NL) — linefeed; ends a row. The server owns linefeeds.
  - `\b` (T_BS) — backspace; the ONLY non-append operation in the whole
    system. xterm handles BS natively (cursor one cell left, next char
    overwrites). Used by the zone rewind (`\b×14`), the R-S repaint
    (`\b×27`), and the spinner.
- FAULT behavior: a faulting row shows `FAULT` (status word only); the
  timeline CONTINUES (other rows proceed — the hidden retry re-invokes
  the probe on the same settled row); the band still reaches READY.
  The retry continuation marker is ` · retry · ` on the same row.
- Dot pacing: dots appear 1:1 with the progress fraction
  (`round(pct/100 × 12)`), driven SOLELY by IMMU's pacer at 50ms cadence
  (PACE_MS). The interpreter's 10Hz strip only re-paints a pct the
  lane-lock held (the type queue was non-empty when the tick landed) —
  it is a drain, not a second dot driver.
- Spinner (reasoning lane): on first reasoning frame type `' »  ⋯ ' + n`
  (T_SPIN_HEAD + count) and remember display length k; each further tick:
  `\b`×k + `' »  ⋯ ' + n` (k = new display length). First content frame:
  `\b`×k + `' » '`, then each content token → `type(s, token)`.
  Raw reasoning text is NEVER rendered on the band (it stays on the
  telemetry lane, inside `llm.telemetry.reasoning_frame`).
- Done ok (user round, post-boot): `'· ' + ms + 'ms | IN ' + inflame +
  ' / OUT ' + outtoken + CRLF` + prompt.

## 6. KNOWN DEFECTS

Each entry is a precise target for the fix round: file + symbol + the
gap between the locked screen and the verified code. No other discoveries
of this kind are asserted.

### D1 — CRTX/LLM1 settle junction: retired chat.* wait (the "DASHClassify" defect)
What it is: the CRTX and LLM1 legs settle from the LLM request lifecycle.
The dispatch names this junction "DASHClassify" (the DASH-side classify/
settle of the ping round); no symbol by that name exists in the tree —
it is the class of settle-wait that still references the retired chat bus
channels (chat.send / chat.response / chat.done — DROPPED per the bus
contract diff in faculties/dash.ts, and the HTTP surface answers 410). The chat surface is RETIRED: `POST /chat` and any
other `/chat` respond `410` (main.ts — verified), and the bus contract
diff states `chat.send / chat.response / chat.done are DROPPED`
(faculties/dash.ts header — verified). Verifying the junction against the
live code at d269733: the bus settle path is already clean — `cortex.ts`
(no longer relays: after the #IDENTITY prepend it publishes ONLY
`llm.request`, and its header comment admits "the old cortex→chat.response
relay is dead") and `faculties/dash.ts` subscribes `llm.content.token` /
`llm.done` / `llm.error` / `llm.abort` directly (lines 410, 476, 485, 498 —
verified). The RETIRED surface that 410s lives in `main.ts`
(`POST /chat` → 410, any other `/chat` → 410 — verified). The defect:
any code path that still settles or waits on `chat.*` — a subscribe to
`chat.response`/`chat.done`, or a settle branch that only fires from the
old chat relay — receives NOTHING forever (those channels are dropped
from the bus contract), so a CRTX ping round that closes through that
retired path never triggers `settleRound` → `interpCrtxSettle` →
`dash.ext.done` → the IMMU slot never settles → the 2s/4s per-leg budget
timer (or the 15s backstop) FAULTs a healthy round. Fix target: confirm
`settleRound` (triggered by `llm.done`/`llm.error`/`llm.abort` on the bus)
is the ONLY CRTX/LLM1 settle trigger; remove any residual `chat.*`
subscribe/wait; delete the stale cortex.ts wiring comment (lines 33-35)
so the doc and the code stop contradicting each other.
Intended path (correct, must remain the only one): LLM faculty stream
parser (faculties/llm.ts) → `llm.done` / `llm.error` on the bus → DASH's
`settleRound` (faculties/dash.ts) → `interpCrtxSettle` / `onPingUsage`
(publish `dash.ext.done` / `dash.ext.fault` on `immu.selftest`) → IMMU's
external-settle route → `selftest.done` → the row repaints.

### D2 — ROM: runtime `n/a` + build-baked value, not a live diskwalk
What it is: the locked screen defines ROM as the LIVE on-disk project
size (`ROM 345k`), but the code reads a BUILD-TIME baked constant.
`BANNER_ROM_TEXT` (faculties/dash.ts) reads
`web-ui/src/lib/boot-consts.json` (`romKiB ?? romBytes/1024`) at module
load, best-effort; on any read/parse failure it renders `n/a` — i.e. a
runtime showing `ROM n/a` is possible today (verified). Today's artifact
is `romKiB: 828.7` (boot-consts.json at d269733 — verified) produced by
`web-ui/scripts/measure-rom.mjs` at build time. Three sub-gaps: (a) value
is baked at build, not measured live per boot; (b) the artifact value
(828.7 KiB) is not the locked `345k`; (c) the display form is `NNN.NKiB`
/ `NNN.NMB`, not the locked integer `k` suffix. Fix target: a live
per-boot diskwalk (walk the project working tree, sum file bytes, exclude
node_modules/build/dist/.svelte-kit/.vercel/.cache/logs/.git + lock
files — reuse the measure-rom.mjs exclusion set as the canonical rule),
captured at boot and rendered as an integer followed by the `k` suffix
(integer KiB/KB, per the locked screen), with `ROM 345k` as the
acceptance value on the current tree.

### D3 — separator / blank-line / dot-separator layout discrepancies
What it is: the locked screen's header+rows layout does not match the
code's emit byte-for-byte, five places (all in faculties/dash.ts):
1. Blank line: the locked screen has a blank line BETWEEN the title and
   the SELF-TEST header; `attachTapePaint` types
   `BANNER_TITLE + CRLF` then `BANNER_SELFTEST_ROW + CRLF` directly — no
   blank line (verified).
2. Dash count: locked screen header width implies a longer dash run; the
   constant is 23 (`'-'.repeat(23)'` in `BANNER_SELFTEST_ROW` —
   verified) and the in-code comment calls it "30×U+002D" while the
   constant is 23 — a self-contradicting comment. The reconstruction
   pins 23 as the single constant; the locked screen's visual width is
   the requirement, so the fix round must reconcile the count against
   the operator's exact rule (last hyphen end-aligned at col 35 with the
   title's last char) and fix the comment to match the constant.
3. Row separator: the locked screen module rows use `....` (4 ASCII dots)
   between label and OK; the code's armed zone is 12 × U+00B7
   (`T_DOT_FIELD`, verified) + `\b×14` settle — a different glyph and
   width class. The locked `....` is the display reading of "dots appear
   1:1 with the fraction"; the code's 12-dot band is the mechanism.
   Fix target: reconcile the on-tape separator to the locked `....`
   row shape (4-char dot field, one dot per progress step up to 4 =
   100%? or the 12-cap) so the stopped row reads
   `> CODE .... OK * NNms` verbatim.
4. Row code spelling: locked screen row 1 is `DASE`; the code key is
   `DASH` (rendered as-is via `m.padEnd(4,' ')`). The five locked codes
   are DASE/TELE/NERV/CRTX/LLM1. Fix target: a display-label map from
   code key → locked display code (DASH→DASE; the other four already
   match) so the band renders the locked spellings verbatim.
5. Retry continuation: the operator-locked ` · retry · ` marker between a
   retried leg's two settles is never emitted — `paintSettledRow`
   (faculties/dash.ts, verified) repaints the row as `\b`×14 + state + CRLF
   (the attempt-2 verdict replaces the attempt-1 fault in place). This is
   internally consistent with the operator's "FAULT = status word only —
   no retry text on the band" lock (dash.ts header, verified), which
   supersedes the older "retry continuation" grammar in the damaged file.
   Fix round: confirm the status-word-only rule and delete the
   retry-continuation marker from the lock set.

### Dead export (noted, not a defect class)
`DISPLAY_VERSION = 'v0.1.0'` (web-ui/src/lib/boot-consts.ts, verified) —
stale (server authority is v0.1.1 via `BANNER_VERSION`) and dead (the
client renders the stream, it does not paint a version). Remove or
delegate to the server's value in the fix round; the spec does not rely
on it.

## 7. /v1/responses Framing Contract (CURRENT CORRECT behavior)

Faculties/llm.ts parses the vLLM `/v1/responses` SSE stream (frames
separated by blank line; `data:` lines; `data: [DONE]` sentinel). This is
the CURRENT CORRECT behavior — the fix round must NOT regress it while
touching the chat.* junction (D1):

- `response.reasoning_text.delta`: consumed in arrival order; each delta
  bumps `reasoning_tokens` and is published to `llm.telemetry` with
  `state: 'reasoning'` (the reasoning frame rides inside
  `llm.telemetry.reasoning_frame`). NO `llm.reasoning.token` channel
  exists and MUST NOT be invented — the telemetry lane is reasoning's
  only address.
- `response.output_text.delta`: consumed in arrival order; each delta
  (first frame has leading whitespace scrubbed once per request — a
  locked terminal contract: the first content frame of a request must not
  lead with whitespace, else it blanks the prompt line) is published to
  `llm.content.token` as `{type:'token', id, lane:'content', text}`, and
  the one-per-frame telemetry is published with `state:'content'`
  (content_tokens += 1 per frame).
- `response.completed`: fires ONCE, gated by the `sawCompleted` guard
  (shared with the `[DONE]` sentinel and error frames — first terminal
  wins, later ones are dropped). It captures vLLM usage from
  `parsed.response.usage` (OpenAI-standard field names: `prompt_tokens`
  / `completion_tokens` / `output_tokens_details.reasoning_tokens`, with
  `input_tokens`/`output_tokens` fallbacks — verified), then publishes
  the one telemetry `done` frame carrying `usage{total_input_tokens,
  total_output_tokens, reasoning_tokens}` + content_tps, and publishes
  `{type:'done', id}` on `llm.done`.
- Error frames (`type` starting `error`): one `llm.error` publish (first
  wins via `sawCompleted`).
- Stream end without a terminal: if any content was seen → one
  `llm.telemetry` `done` + `llm.done`; if nothing was seen →
  `llm.error` `NO_CONTENT`.
- Exactly ONE `done` per request (the `done_issued` latch on the
  telemetry payload path + `sawCompleted` on the frame path — both
  verified) is what DASH's LLM1 usage-convergence check (±1) depends on.

## Appendix — verified anchors (code read, d269733)

faculties/dash.ts: `BANNER_VERSION` 'v0.1.1' · `BANNER_TITLE` ·
`BANNER_SELFTEST_ROW` ('- SELF-TEST ' + '-'.repeat(23)) · `BANNER_READY_ROW`
'READY.' · `BANNER_ROM_TEXT` (boot-consts.json read, `'n/a'` fallback) ·
`bannerMemText()` (process.memoryUsage().rss) · `bannerStatsRow()` ·
`T_NL` "\r\n" · `T_BS` · `T_DOT` '·' · `BANNER_DOT_COUNT` 12 ·
`T_DOT_FIELD` (12·+2sp) · `T_ZONE_ERASE` `\b`×14 · `T_OK` 'OK * ' ·
`T_FAULT` 'FAULT' · `T_SPIN_HEAD` ' »  ⋯ ' · `T_RS_PENDING/RESOLVED/SCANNING`
· `T_RS_REWIND` 27 · `T_PROMPT` U+2588 · `DASH_BOOT_MODULES` [DASH, TELE,
NERV, CRTX, LLM1] · `DashBootModule` · `probeDash`/`probeTele`/`probeNerv`/
`probeCrtx`/`probeLlm1` · `interpretCrtxSettle`→`interpCrtxSettle` ·
`onPingUsage` · `settleRound` · `onImmuSelftest` · `attachTapePaint`
(`'-'.repeat(32)` footer, ROM/MEM, READY., block cursor) · `type()`
(≤32-char chunks, 50ms interval) · `send()` · `isAllowedHost`/
`DASH_GATE_HOSTS` · `DASH_DISK_FLOOR_BYTES` (500 MiB) · `DASH_PROBE_RING_CAP`
(128) · `DASH_CONN_IDLE_CAP_MS` (30_000) · `DASH_SSE_FAIL_LIMIT` (3) ·
`PING_PROMPT` 'ping' / `PING_MAX_TOKENS` 16 · frame sends: sseinit/ready/
chars/stats/flow/vram/err · `synapse.subscribe('immu.selftest', …, 'dash')` ·
`{'boot_status': true}` POST with header `x-dash-session`.
faculties/immune-system/boot.ts: `IMMUSequencer` · `IMMU_LEG_ORDER`
[DASH, TELE, NERV, CRTX, LLM1] · `IMMU_LEG_BUDGET_MS` {DASH 3000, TELE 3000,
NERV 3000, CRTX 2000, LLM1 4000} · `IMMU_BACKSTOP_MS` 15_000 · `PACE_MS` 50 ·
`pub(ev, channel='immu.selftest')` · events selftest.start/progress/done/
fault/complete/ignored · `boot.refused{busy,auth}` · `dash.ext.done/fault`
route (wireExternal) · `ImmuProbeFn`/`ImmuReport` · state persisted to
~/.carl/selftest-state.json.
faculties/llm.ts: `/v1/responses` parser (`processFrame`) ·
`response.reasoning_text.delta` → llm.telemetry{state:'reasoning'} ·
`response.output_text.delta` → llm.content.token + llm.telemetry
{state:'content'} · `response.completed` → usage capture + one done via
`sawCompleted` guard · `llm.done`/`llm.error` publishes · `done_issued`
latch · `NO_CONTENT` fallback.
main.ts: `GET /dash` (SSE attach) / `POST /dash` (send, 202 receipt,
`{msg, session}`, header `x-dash-session`) · `GET /version` → `{version:
BAKED_SEMVER ('0.1.0'), surface: 'dash'}` · `POST /chat` → 410 · other
`/chat` → 410 · origin gate 403.
faculties/dash.ts (send path): `handleSend` — echo `'« ' + msg + CRLF`
only when `s.band.settled` · CRAA adopt (`craaAdopted`, in-process
`immu.reportDone('CRTX'/'LLM1', adoptMs)`) · `{t:'err'}` codes
`PING_SUPERSEDED` / `LLM_ERROR` / `ABORTED` / `BAD_PAYLOAD` / `EMPTY_MSG` ·
post-boot user-round settle `'· ' + ms + 'ms | IN ' + inflame + ' / OUT '
+ outtoken + CRLF + T_PROMPT` · fail/aborted → `'ERR ' + status + CRLF`.
web-ui: `boot-consts.json` {romBytes: 848595, romKiB: 828.7, srcFiles: 152,
xtermVersion: 6.0.0} · `boot-consts.ts` `DISPLAY_VERSION` 'v0.1.0' (dead) ·
`scripts/measure-rom.mjs` (git-ls-files walk, exclusion set, cost
per tracked file) · `Chat.svelte` `term.write(frame.c)`-only relay,
POST /dash with X-Dash-Session tag.
