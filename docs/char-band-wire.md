# DASH /dash — char-band wire design (LOCKED, operator 2026-10-27)

Read this FIRST. It supersedes every older frame-grammar comment in
faculties/dash.ts (those long header comments predate this design).

## The wire

ONE visible-text frame kind. Everything the user SEEES comes as:

    {t:'chars', c:<string>}         c ≤ 32 chars, cadence ≤ 25Hz

Special bytes are PLAIN CHARACTERS inside c:
  '\n'  linefeed — ends a row (the server owns linefeeds, not the client)
  '\b'  backspace — take back the last printed char (xterm handles BS
        natively: cursor one cell left, next char overwrites the cell).
        The ONLY non-append operation in the whole system. Used ONLY by
        the spinner path.

Removed from the wire (all had client-side machinery that is deleted):
  banner, boot, user, content, thinking, reasoning, done
Kept (control/data, NOT visible tape):
  sseinit (session/tag/host/gate), ready, stats, flow, vram

## The client (web-ui)

The ENTIRE visible path is:

    if (frame.t === 'chars') term.write(frame.c)   // ONLY

No CUP. No row map. No partial. No seed rows. No client echo. No client
spinner. No client dot timer. No row model. The xterm parser (the
"kernel tty driver") owns the screen buffer, exactly like a real TTY:
the writing side (server) only types — it never knows or touches the
column.

Client still owns:
  - xterm init (current font chain, 16px, ls 0, lineHeight 1.0)
  - EventSource attach to /dash
  - composer input capture + Enter → POST /dash {msg}  (clear typedText)
  - the side HUD cells fed by stats/flow/vram (data panels, not tape)
  - a ~15-line transcript rebuild: accumulate chars of the live row,
    on '\n' push the completed row to history[] (for replay/HUD use)
  - '\b' handling in the transcript rebuild: pop last char of the live
    row buffer (xterm already did it on screen; keep the log faithful)

## The server (faculties/dash.ts)

The server is a TEXT GENERATOR. It owns every byte on the buffer.

Mechanism: private type(s, text) → chunks into ≤32-char {t:'chars'}
frames through the existing send() (the per-session type queue drained
by a pausing interval is fine; no busy-wait).

### Banner (per-attach, the tape):

1. '  CARL ── PROVISIONING TERMINAL v<VERSION>' + '\n'   (typed ~30ms/char)
2. 'SELF-TEST …' + '─'×30 + '\n'
3. MODULE ROWS — DASH_BOOT_DISPLAY_ORDER, STRICTLY ONE AT A TIME:
   prev row's '\n' queued before the next row's first char:
       '  > DASH  '        label typed (4-char label, fixed width)
       '.' ×n              dots: ONE dot per real progress step of the
                           leg (cap 20Hz, max 12 — the field is 12)
       settle text         '  OK * NNms'  OR  '  FAULT — <detail>'
       '\n'                ONLY after the final verdict
   FAULT + auto-retry (existing 1.5s single retry): the row continues on
   the SAME line — do NOT emit '\n' on first-fault; after retry:
       ok    → ' · retry ·  OK * NNms' + '\n'
       fault → ' · retry ·  FAULT — <detail2>' + '\n'
   The next module starts only after that '\n'.
   CRTX/LLM1: their rows are typed when the ping round is issued; dots
   fill as the round's real frames arrive; settle = the round done
   (usage converged). If the user cancels-and-adopts, the same rows
   continue on the user round (no new rows).
4. After all 6 rows have '\n':
   '  ROM <rom> · MEM <rss>' + '\n'      (RSS = process.memoryUsage())
   STATUS row (the committed triad/gate cell text — reuse BANNER_TRIAD_ROW)
   '  READY.' + '\n'
   '❯ '                               (prompt, NO linefeed)

### Rounds:

  on send:      '« ' + msg + '\n'          (server echo; client pre-echo
                                              is GONE)
  reasoning:    spinner — on first reasoning frame:
                  type ' »  ⋯ '  and remember its display length k
                each further tick: type '\b'×k + ' »  ⋯ ' + <frame>
                  (k = new display length)
  first content: type '\b'×k + ' » '
  content:      each token → type(s, token)   (chars frames)
  done (ok):    '  · ' + ms + 'ms | IN ' + in + ' / OUT ' + out + '\n' + '❯ '
  err:          '  ERR ' + msg + '\n' + '❯ '

### Keep untouched

  - origin gate (isAllowedHost, 403 on foreign Host)
  - the self-test probe BODIES (TELE/NERV/IMMU/DASH logic, retry rule,
    usage convergence, the NERV (iii-b) llm.done validator probe)
  - the session state machine (rounds map, busy, zhang backoff, GC caps)
  - stats/flow/vram tickers
  - cortex.ts (byte-identical), fonts, gate hosts

## Tape = truth

Replaying the frame log through any terminal renders exactly what the
screen showed. The CLI (cli/carl) on the same /dash gets the identical
UI — same bytes, any pipe.
