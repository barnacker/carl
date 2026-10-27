<script lang="ts">
  import { onMount } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import './fonts.css';
  import type { Spinner } from './spinners';
  import { spinners, spinnerById, DEFAULT_SPINNER_ID } from './spinners';
  import { ROM_BYTES, ROM_KIB, XTERM_VERSION, GATE_DISPLAY, LINK_DISPLAY, DISPLAY_VERSION } from './boot-consts';

  // ── DASH — the single surface ─────────────────────────────────────────────
  // One SSE stream carries: boot self-test lines, user/thinking/reasoning/
  // content/done frames, continuous stats + flow (telemetry 1Hz), and a 1Hz
  // vram cell. The SPA is one stream consumer; xterm.js is the transcript
  // and boot banner in the same surface. The 3-cell HUD strip below renders
  // stats/flow/vram independently of chat activity — "listening to the engine."
  const DASH_ENDPOINT = '/dash';
  const SPINNER_KEY = 'carl.spinner';

  // The BODY face (baked JetBrains Mono — self-hosted, OFL; see fonts.css).
  // The xterm instance is PURE mono for ALL terminal content (transcript +
  // boot banner + frame box/title — font-native box-drawing), 16px + 0.3px
  // letter-spacing locked. Orbitron is chrome-only (the SPCPECTRA shell).
  const FONT_STACK =
    "'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace";
  const FONT_SIZE = 16;
  const FONT_LETTER_SPACING = 0.3;

  const CLEAR_LINE = '\x1b[2K';

  type Entry = {
    user: string;
    reasoningChars: number; // COUNT ONLY — raw reasoning stays dark
    content: string;
    open: boolean;
    thinking: boolean;
    firstByte: boolean;
    reqId: string | null;
    error: string | null;
  };

  // ── self-test state ────────────────────────────────────────────────────────
  const MODULES = ['TELE', 'NERV', 'IMMU', 'CRTX', 'LLM', 'DASH'] as const;
  type ModuleState = 'pending' | 'ping' | 'testing' | 'ok' | 'fault';
  let modDots = $state<number[]>([0, 0, 0, 0, 0, 0]);
  let modState = $state<ModuleState[]>(MODULES.map(() => 'pending'));
  let modMs: (number | null)[] = $state<(number | null)[]>([null, null, null, null, null, null]);
  let modRetry = $state<boolean[]>([false, false, false, false, false, false]);
  // The ONE live line: the module currently streaming its dots (or -1 when
  // none — a settled line is frozen, the next line then starts; the dots
  // grow on the live line ONLY, one live line at a time).
  let dotStream = $state<boolean[]>([true, true, true, true, true, true]);
  const modDotsTimer: NodeJS.Timeout[] = [null, null, null, null, null, null] as unknown as NodeJS.Timeout[];
  let selftestHeader = $state<'testing' | 'passed' | 'fault'>('testing');
  const DOTS_FULL = 12;
  const DOT_STEP_MS = 100;
  // Natural-flow boot: the whole banner (frame + title + ROM/MEM + SELF-TEST
  // header + 6 module lines + triad + READY. + frame bottom) is a set of
  // literal ROWS appended top-to-bottom in order. The composer is the TAIL
  // line by definition — each keystroke re-renders only the current tail line
  // (CUP to its row, col 1). No minimum-rows calc, no whitespace seeding, no
  // absolute positioning: if the viewport can't hold the block, the TOP scrolls
  // off and the bottom rows + prompt stay visible (the natural-clip contract).
  type BootState = 'booting' | 'ready' | 'fault';
  let bootState = $state<BootState>('booting');
  const frameW = 66; // the frame box inner width (single-width chars only)

  function idx(m: string): number {
    return (MODULES as readonly string[]).indexOf(m);
  }
  function settleModule(m: string, ok: boolean, ms: number | null): void {
    const i = idx(m);
    if (i < 0) return;
    if (modState[i] === 'ok' || modState[i] === 'fault') return; // settle once
    modDots[i] = DOTS_FULL;
    dotStream[i] = false; // settled → the line is FROZEN as last painted
    modMs[i] = ok ? (ms ?? 0) : (ms ?? 0);
    modState[i] = ok ? 'ok' : 'fault';
    // The settle IS the last paint (the timer's final tick at 12 dots wrote
    // the row already) — no extra repaint; a settled line is PERMANENT
    // (never re-cursor'd except a FAULT retry, which re-animates its row).
    if (!ok && !modRetry[i]) {
      // First FAULT: the server fires ONE auto-retry; the retry re-animates
      // only its own row (re-notified via a fresh 'boot testing' frame).
      modRetry[i] = true;
      return;
    }
    // Every module has now settled → emit the tail of the boot block (the
    // SELF-TEST header flips, then the triad + READY. + frame bottom).
    const allSettled = modState.every((st) => st === 'ok' || st === 'fault');
    if (allSettled && bootState === 'booting') {
      const anyFault = modState.some((st) => st === 'fault');
      selftestHeader = anyFault ? 'fault' : 'passed';
      bootState = anyFault ? 'fault' : 'ready';
      // Repaint the header at the tail of the module block (still on-screen
      // unless the viewport is tiny), then append the closing rows.
      if (selftestHeaderY > 0 && term) {
        const bufBase = term.buffer.active.baseY;
        const rel = selftestHeaderY - bufBase + 1;
        if (rel >= 1 && rel <= term.rows)
          term.write('\x1b[' + rel + ';1H' + CLEAR_LINE + selftestHeaderLine(selftestHeader));
      }
      appendBootTail();
    }
  }

  // ── spinner pickbox ────────────────────────────────────────────────────────
  const PREVIEW_SLOW = 2;
  let previewTicks = $state(0);
  let spinOpen = $state(false);
  let spinPickBox: HTMLDivElement;
  let previewState = $state(spinners.map((s) => {
    const int = Math.max(100, Math.round(s.interval * PREVIEW_SLOW));
    return { next: int, int, i: 0 };
  }));
  $effect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(now - last, 250);
      last = now;
      for (let r = 0; r < previewState.length; r++) {
        const st = previewState[r];
        st.next -= dt;
        if (st.next <= 0) {
          st.i = (st.i + 1) % spinners[r].frames.length;
          st.next += st.int;
          previewTicks++;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
  function previewFrame(s: Spinner): string {
    const st = previewState[spinners.indexOf(s)];
    return s.frames[st.i] ?? s.frames[0] ?? '';
  }
  function loadSpinner(): string {
    try {
      const v = localStorage.getItem(SPINNER_KEY);
      if (v && spinners.some((s) => s.id === v)) return v;
    } catch { /* non-fatal */ }
    return DEFAULT_SPINNER_ID;
  }
  let spinnerId = $state(loadSpinner());
  function setSpinner(v: string) {
    spinnerId = v;
    try { localStorage.setItem(SPINNER_KEY, v); } catch { /* non-fatal */ }
  }

  // ── xterm terminal ─────────────────────────────────────────────────────────
  let termHost: HTMLDivElement;
  let term: Terminal | null = null;
  let fit: FitAddon | null = null;
  let inputEl: HTMLInputElement;
  let booted = false;
  let dashAttached = $state(false);
  let dashOk = false;

  const USER_MARKER = '❮';
  const ASSISTANT_MARKER = '❯';
  const PROMPT_PREFIX = '❯';

  // ── COMPOSER (the type-drift fix) ──────────────────────────────────────────
  // THE PROMPT ROW is at a FIXED ABSOLUTE buffer Y. Every render addresses it
  // with CUP (\x1b[row;1H → col 1) — so the row NEVER drifts: per-keystroke
  // drift happened because the old code wrote at the CURRENT cursor column
  // (which advances with each write) instead of rewinding to col 1.
  //
  // The composer state is (fixed prefix '❯' + typedText).
  // On entry the prefix+typedText is written to the row; xterm's native
  // cursor sits at the end of the rendered text (caret blinks there).
  // On every key: re-emit the WHOLE prompt row from col 1 using CUP.
  //
  // Enter commits the row into scrollback (the existing final-line contract)
  // and clears the composer. Backspace pops and re-renders. Arrows are
  // no-op (single-line composer, documented).
  let typedText = $state('');
  // ── COMPOSER (the CURRENT row, col 1) — the typed-drift fix ────────────────
  // The composer lives on the row where xterm's own append flow currently IS.
  // Every render rewrites that whole row from COLUMNS 1 (CUP row;1H — the row
  // where writing position always lands: the 0-based buffer row a byte just
  // scrolled to appears at 1-based `baseY + rows`). So typing rewrites from
  // col 1 per key — the row NEVER moves: the prompt row is the last appended
  // row, typing adds width within it (no newline), Enter commits it high with
  // a scroll and the composer lands on the NEW current row. xterm's own
  // follow-near-tail default is the only follow logic: no tail math, no
  // bottom-hug, no pad seeding, no clamp — the stream is pure append.
  function renderComposer(): void {
    if (!term) return;
    const buf = term.buffer.active;
    const row1 = buf.baseY + buf.length; // 1-based current (just-scrolled) row
    if (row1 < buf.baseY + 1) return; // nothing appended yet
    const width = term.cols;
    const text = PROMPT_PREFIX + ' ' + typedText;
    const truncated = text.length > width ? text.slice(0, width) : text;
    term.write('\x1b[' + row1 + ';1H' + CLEAR_LINE + truncated);
  }
  function renderCurrentComposer(): void {
    renderComposer();
  }

  // ── request stream (DASH) ──────────────────────────────────────────────────
  let history = $state<Entry[]>([]);
  let sending = $state(false);
  let spinnerActive = $state(false);
  let step = $state<'idle' | 'posting' | 'receiving'>('idle');
  let ready = $state(false);
  let spinnerFrame = $state(spinnerById(loadSpinner()).frames[0]);
  let dashController: AbortController | null = null;
  // The session-correlation tag handed out on the SSE handshake ({t:'sseinit',
  // tag}). Every POST /dash echoes it (header X-Dash-Session) so the server
  // resolves the separate POST connection back onto the session that owns the
  // stream. the frame order at attach: sseinit → ready → boot*6.
  let connTag = $state('');
  let streamReady = $state(false);

  $effect(() => {
    const set = spinnerById(spinnerId);
    const int = set.interval > 0 ? set.interval : 100;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % Math.max(1, set.frames.length);
      spinnerFrame = set.frames[i] ?? spinnerFrame;
      if (spinnerActive) printSpinnerFrame(spinnerFrame);
    }, int);
    return () => clearInterval(t);
  });

  // ── HUD strip state ────────────────────────────────────────────────────────
  type Huds = {
    ttft: number | null;
    tspk: number | null;
    comp: number;
    flow: number[];        // per-lane avg bright (for the sparkline)
    vram: number | null;
    vramSrc: string;
  };
  let huds = $state<Huds>({
    ttft: null, tspk: null, comp: 0, flow: [], vram: null, vramSrc: 'vllm',
  });
  const FLOW_MAX = 60;
  function updateHuds(p: Record<string, unknown>) {
    if (typeof p.ttft === 'number') huds.ttft = p.ttft;
    if (typeof p.tokensPerSec === 'number') huds.tspk = p.tokensPerSec;
    if (typeof p.completions === 'number') huds.comp = p.completions;
    const fl = p.flow as number[] | undefined;
    if (Array.isArray(fl) && fl.length) huds.flow = fl.slice(-FLOW_MAX);
  }
  function updateVram(v: number | null, label?: string) {
    huds.vram = v;
    if (label) huds.vramSrc = label;
  }

  // ── print primitives ───────────────────────────────────────────────────────
  function printUserLine(text: string): void {
    if (!term) return;
    term.write(CLEAR_LINE + USER_MARKER + ' ' + text + '\r\n');
  }
  function printSpinnerFrame(frame: string): void {
    if (!term) return;
    term.write(CLEAR_LINE + '  ' + frame + ' ');
  }
  function printFirstContentFrame(tok: string): void {
    if (!term) return;
    term.write(CLEAR_LINE + ASSISTANT_MARKER + ' ' + tok);
  }
  function printContentToken(tok: string): void {
    if (!term) return;
    term.write(tok);
  }
  // Close out a turn's content: a single newline right after the last token.
  // xterm's own auto-follow/close behavior plus our tail-rendering handles the
  // rest — no programmatic scrollToBottom here.
  function printDoneRow(): void {
    if (!term) return;
    term.write('\r\n');
  }
  function printError(msg: string): void {
    if (!term) return;
    term.write('\r\n');
    term.writeln('E ' + msg);
    term.write('\r\n');
  }

  function focusInput() {
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      }
    }, 0);
  }

  // ── banner (locked form) ───────────────────────────────────────────────────
  const BANNER_VERSION = 'v0.1.0';
  function romText(): string {
    const kb = (ROM_BYTES / 1024);
    const s = kb >= 1024
      ? (kb / 1024).toFixed(1) + 'MB'
      : kb.toFixed(1) + 'KiB';
    return s;
  }
  function memText(): string {
    const m = (performance as any).memory as { usedJSHeapSize?: number } | undefined;
    if (!m || typeof m.usedJSHeapSize !== 'number') return 'n/a';
    const kb = m.usedJSHeapSize / 1024;
    return kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb.toFixed(0) + 'KiB';
  }

  function selftestHeaderLine(h: 'testing' | 'passed' | 'fault'): string {
    // FLUSH form — the header fills the whole inner width of the frame
    // (frameW = 46): 'SELF-TEST' + status + exactly enough '─' to reach 46
    // columns. No leftover ruler at the right edge — the box edge is the edge.
    const base = 'SELF-TEST ' + (h === 'testing' ? '…' : h === 'passed' ? '… PASSED' : '… FAULT');
    const pad = Math.max(0, frameW - [...base].length);
    return base + '─'.repeat(pad);
  }
  function selftestRowLine(i: number): string {
    const label = MODULES[i];
    const st = modState[i];
    let dots: string;
    if (st === 'ok' || st === 'fault') {
      // settled: full 12 dots
      dots = '.'.repeat(DOTS_FULL);
    } else if (st === 'pending') {
      // the round-rows (CRTX/LLM) pre-exist as the pending placeholder:
      // dots stay empty (0 grown) until a round actually runs them.
      dots = ' '.repeat(DOTS_FULL);
    } else {
      const d = modDots[i];
      dots = '.'.repeat(d) + ' '.repeat(DOTS_FULL - d);
    }
    let status: string;
    let suffix = '';
    if (st === 'ok') { status = 'OK'; if (modMs[i] !== null) suffix = ' * ' + String(modMs[i]).padStart(2, '0') + 'ms'; }
    else if (st === 'fault') { status = 'FAULT'; }
    else if (st === 'ping') { status = 'PING'; }
    else { status = '…'; }
    // exact row anatomy: '> ' + label(4) + ' ' + dots(12) + ' ' + status (width 5)
    return '  > ' + label.padEnd(4) + ' ' + dots + ' ' + status.padEnd(5) + suffix;
  }

  // ── boot block (NATURAL-FLOW: literal rows appended top-to-bottom) ──────────
  // The WHOLE banner is a set of literal ROWS, each appended once, in order.
  // The frame box is drawn as literal rows (single-width box-drawing chars),
  // so it is just MORE rows of the banner. Append order (10 content rows):
  //   frame top  ( '┌' + '─'×w + '┐' )
  //   title        ( '│' + '  CARL ── PROVISIONING TERMINAL … v0.1.0' + '│' )
  //   blank        ( '│' + ' '×w + '│' )
  //   rom/mem      ( '│' + '  ROM 640.2KiB · MEM 12.3MB' + pad + '│' )
  //   blank        ( '│' + ' '×w + '│' )
  //   SELF-TEST h  ( '│' + '  SELF-TEST … ───' + pad + '│' )  (flush form)
  //   6 module     ( '│' + '  > TELE …' + pad + '│' )
  //   blank        ( '│' + ' '×w + '│' )
  //   triad        ( '│' + '  SEQUENCE … OK  GATE … OK  LINK ' + pad + '│' )
  //   blank        ( '│' + ' '×w + '│' )
  //   READY.       ( '│' + '  READY.' + pad + '│' )   (READY. exactly once)
  //   frame bottom ( '└' + '─'×w + '┘' )
  //   prompt tail  ( the composer — the natural-clip contract: if the viewport
  //                  can't hold all of it, the TOP scrolls off, the bottom rows
  //                  + prompt stay visible. NO seedPad, NO absolute position. )
  // The 6 module lines pre-exist at boot (pending ones as '> CRTX …') so the
  // full shape is visible from frame 1. A module's line is APPENDED when its
  // test starts; that single line's dots grow in place (100ms); when it
  // settles the dots pad to 12 + 'OK * NNms' (or 'FAULT') and the line is
  // PERMANENT (never re-cursor'd except a FAULT retry re-animates its row).
  // At READY the whole block is frozen history.

  // Frame-box row helpers (w = frameW, the number of '─' between the corners).
  const HLINE = '─'.repeat(frameW);
  function frameTop(): string    { return '┌' + HLINE + '┐'; }
  function frameRuler(): string  { return '├' + HLINE + '┤'; }
  function frameBottom(): string { return '└' + HLINE + '┘'; }
  // A bordered content row: '│' + content padded (single-width) + '│'.
  function frameRow(content: string): string {
    const pad = Math.max(0, frameW - [...content].length);
    return '│' + content + ' '.repeat(pad) + '│';
  }

  let selftestHeaderY = 0; // absolute buffer row of the SELF-TEST header row
  const BANNER_TITLE = '  CARL ── PROVISIONING TERMINAL' + ' '.repeat(frameW - 37) + BANNER_VERSION;
  function bootHeaderLine(h: 'testing' | 'passed' | 'fault'): string {
    return frameRow(selftestHeaderLine(h).trimStart());
  }
  function bootModuleRow(i: number): string {
    return frameRow(selftestRowLine(i).trimStart());
  }
  // The triad is the SEQUENCE/GATE/LINK line only — STATUS … READY was dropped
  // (READY. appears exactly once, as the final standalone line). The cells are
  // sized to the frame (frameW = 46, single-width): SEQUENCE … OK/… (13),
  // GATE … hermes,127.0.0.1 (27), LINK 10.240.232.32:8000 (26 — the gate word
  // itself is sacred; the link cell is its display-only mirror).
  function bootTriadRow(): string {
    const allOk = MODULES.every((_, i) => modState[i] === 'ok');
    const a = '  SEQUENCE … ' + (allOk ? 'OK' : '…'); // 13 or 14
    const b = '  GATE … ' + GATE_DISPLAY; // 27
    const c = ' LINK ' + LINK_DISPLAY; // 25
    return frameRow(a + b + c);
  }

  // Append one literal banner row (a single \r\n-terminated write). The cursor
  // stays at col 0 of the NEXT row (natural flow). Returns the absolute row the
  // text was written onto (for the one in-place repaint the self-test needs).
  function appendRow(text: string): number {
    if (!term) return -1;
    const bufBase = term.buffer.active.baseY;
    const rel = term.buffer.active.viewportY - bufBase + 1; // current row (1-based)
    term.write(CLEAR_LINE + text + '\r\n');
    return rel + bufBase - 1; // absolute 0-based buffer row of the written line
  }

  // Append the opening banner rows (frame top → header), recording the header
  // row AND how many frame rows precede it in the buffer (natural flow: on a
  // SHORT viewport the top rows have already scrolled off, so the header's
  // on-screen row ≠ its frame ordinal — we address rows from the buffer, not
  // the frame). The 6 module rows are pre-appended so the full shape is
  // visible from frame 1 (their rows are `selftestHeaderY + 1 + i`).
  function openBoot(): void {
    if (!term || bootState !== 'booting' || layoutDone) return;
    let pre = 0; // frame rows appended so far (natural-flow count)
    const rr = (t: string): number => { const y = appendRow(t); pre += 1; return y; };
    rr(frameTop());
    rr(frameRow(BANNER_TITLE));
    rr(frameRow(''));
    rr(frameRow('  ROM ' + romText() + ' · MEM ' + memText()));
    rr(frameRow(''));
    selftestHeaderY = rr(bootHeaderLine('testing'));
    headerPrecededRows = pre; // rows in-frame ABOVE the header (for S4-rel mapping)
    for (let i = 0; i < MODULES.length; i++) {
      modState[i] = 'pending';
      modDots[i] = 0;
      rr(bootModuleRow(i));
    }
    layoutDone = true;
  }

  // The absolute (0-based buffer) row of module row i. The rows are appended
  // in order right under the header row, so this is stable bookkeeping of lines
  // we ourselves appended (natural-flow; the buffer only ever scrolls up).
  function moduleRowAbs(i: number): number {
    return selftestHeaderY + 1 + i;
  }

  // Repaint module row i in place — CUP to that row's absolute buffer row
  // (header + 1 + i), col 1, the bordered content. This is the ONE in-place
  // repaint the self-test needs (dot growth); the row is still APPEND-ONLY in
  // the macro sense (it is written at its append position and never moved).
  function paintModuleRow(i: number): void {
    if (!term) return;
    const abs = moduleRowAbs(i); // absolute 0-based buffer row
    const bufBase = term.buffer.active.baseY;
    const rel = abs - bufBase + 1;
    if (rel < 1 || rel > term.rows) return; // off-screen (short viewport) — skip
    term.write('\x1b[' + rel + ';1H' + CLEAR_LINE + bootModuleRow(i));
  }
  let headerPrecededRows = 0;

  // Append the closing tail (frame mid → READY. → frame bottom) once every
  // module has settled. On a viewport too short to hold the FULL block (the
  // natural-clip case), the top rows scroll off as we append — so after the
  // tail we pad the buffer to the bottom, guaranteeing the frame-bottom +
  // prompt land at the tail (no jump: the TOP simply falls off, bottom stays).
  function appendBootTail(): void {
    if (!term || tailAppended) return;
    tailAppended = true;
    appendRow(frameRow(''));
    appendRow(bootTriadRow());
    appendRow(frameRow(''));
    appendRow(frameRow('  READY.'));
    appendRow(frameBottom());
    renderCurrentComposer();
    focusInput();
  }
  let tailAppended = false;
  let layoutDone = false;

  // ── frame dispatch ──────────────────────────────────────────────────────────
  type DashFrame = { t: string; [key: string]: unknown };
  let dashStreamSeenFrame = false;

  function handleFrame(f: DashFrame): void {
    switch (f.t) {
      case 'boot': {
        const m = f.m as string;
        const s = f.s as 'testing' | 'ok' | 'fault' | 'pending';
        if (s === 'ping') {
          // The connect-time ping row (CRTX/LLM): very visible — a 'PING' status
          // plus a 12-dot field. Its dots grow right away (the ping IS the test),
          // its id rides the frame so we track exactly this round.
          const i = idx(m);
          if (i >= 0) {
            modState[i] = 'ping';
            modDots[i] = 0;
            dotStream[i] = true;
            paintModuleRow(i);
            clearInterval(modDotsTimer[i]);
            modDotsTimer[i] = setInterval(() => {
              if (modState[i] !== 'ping') { clearInterval(modDotsTimer[i]); return; }
              if (!dotStream[i]) return;
              modDots[i] = Math.min(DOTS_FULL, modDots[i] + 1);
              if (modDots[i] === DOTS_FULL) clearInterval(modDotsTimer[i]);
              paintModuleRow(i);
            }, DOT_STEP_MS);
          }
          break;
        }
        if (s === 'pending') {
          // The pending placeholder. Record the state; the line is already
          // drawn in the frame.
          const i = idx(m);
          if (i >= 0 && modState[i] === 'pending') modState[i] = 'pending';
          break;
        }
        if (s === 'testing') {
          const i = idx(m);
          if (i >= 0 && (modState[i] === 'pending' || modState[i] === 'fault')) {
            // Start (or FAULT-retry re-animate) this module's line. It is the
            // APPEND-ONLY row: paint the bordered row now, then grow its dots
            // in PLACE on that ONE row (100ms cadence) while only this row
            // animates. (A FAULT retry re-animates only its own row.)
            modState[i] = 'testing';
            modDots[i] = 0;
            dotStream[i] = true; // (re)open the live line: dots stream only here
            paintModuleRow(i);
            clearInterval(modDotsTimer[i]);
            modDotsTimer[i] = setInterval(() => {
              if (modState[i] !== 'testing') { clearInterval(modDotsTimer[i]); return; }
              if (!dotStream[i]) return; // another line is live (or this one settled)
              modDots[i] = Math.min(DOTS_FULL, modDots[i] + 1);
              if (modDots[i] === DOTS_FULL) clearInterval(modDotsTimer[i]);
              paintModuleRow(i);
            }, DOT_STEP_MS);
          }
        } else if (s === 'ok') {
          settleModule(m, true, (f.ms as number | null) ?? 0);
        } else if (s === 'fault') {
          settleModule(m, false, (f.ms as number | null) ?? 0);
        }
        break;
      }
      case 'sseinit': {
        // Handshake: capture the session-correlation tag for this stream.
        if (typeof f.tag === 'string') connTag = f.tag;
        break;
      }
      case 'ready': {
        ready = true;
        streamReady = true;
        dashAttached = true;
        break;
      }
      case 'user': {
        if (typeof f.text === 'string') printUserLine(f.text);
        break;
      }
      case 'thinking': {
        // No client-side action beyond the spinner (driven by first reasoning).
        break;
      }
      case 'reasoning': {
        // CONSUMED INTO COUNT ONLY — the raw text stays dark on this surface.
        const e = history[history.length - 1];
        if (e && typeof f.text === 'string') {
          if (e.reasoningChars === 0 && !e.firstByte && !spinnerActive) {
            e.thinking = true;
            spinnerActive = true;
            if (step === 'posting') step = 'receiving';
            printSpinnerFrame(spinnerFrame);
          }
          e.reasoningChars += f.text.length;
        }
        break;
      }
      case 'content': {
        if (typeof f.text !== 'string') return;
        let e = history[history.length - 1];
        if (!e) return;
        if (!e.firstByte) {
          e.firstByte = true;
          e.thinking = false;
          spinnerActive = false;
          printFirstContentFrame(f.text);
        } else {
          printContentToken(f.text);
        }
        e.content += f.text;
        step = step === 'posting' ? 'receiving' : step;
        break;
      }
      case 'done': {
        const e = history[history.length - 1];
        if (e) {
          e.open = false;
        }
        spinnerActive = false;
        printDoneRow();
        break;
      }
      case 'stats': {
        updateHuds(f);
        break;
      }
      case 'flow': {
        const fl = (f.flow as number[] | undefined) ?? undefined;
        if (fl && fl.length) huds.flow = fl.slice(-FLOW_MAX);
        break;
      }
      case 'vram': {
        updateVram(typeof f.vram === 'number' ? f.vram : null, typeof f.src === 'string' ? f.src : undefined);
        break;
      }
      case 'err': {
        printError((typeof f.msg === 'string' ? f.msg : f.code) + '');
        const e = history[history.length - 1];
        if (e) e.open = false;
        spinnerActive = false;
        printDoneRow();
        break;
      }
      default:
        break;
    }
    dashStreamSeenFrame = true;
  }

  // ── open DASH stream ───────────────────────────────────────────────────────
  async function openDashStream(): Promise<void> {
    if (dashController) return;
    const c = new AbortController();
    dashController = c;
    try {
      const res = await fetch(DASH_ENDPOINT, {
        headers: { accept: 'text/event-stream' },
        signal: c.signal,
      });
      if (!res.ok || !res.body) throw new Error('dash attach: ' + res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf8');
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const frameMsg = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          for (const line of frameMsg.split('\n')) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (!payload) continue;
            let parsed: DashFrame | null = null;
            try { parsed = JSON.parse(payload) as DashFrame; } catch { continue; }
            if (!parsed || typeof parsed.t !== 'string') continue;
            handleFrame(parsed);
          }
        }
      }
    } catch {
      /* stream closed (page unload or abort) — non-fatal */
    } finally {
      dashController = null;
    }
  }

  // ── mount ──────────────────────────────────────────────────────────────────
  onMount(() => {
    const t = new Terminal({
      convertEol: false,
      disableStdin: true,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: FONT_STACK,
      fontSize: FONT_SIZE,
      lineHeight: 1.2,
      letterSpacing: FONT_LETTER_SPACING,
      // Natural flow — xterm behaves normal: append-at-current + its own
      // follow-near-tail default is the ONLY follow logic (no tail math, no
      // pad seeding, no clamp). Deterministic 1000-line scrollback.
      scrollback: 1000,
      theme: {
        background: '#000',
        foreground: '#e6edf3',
        cursor: '#00ff41',
        cursorAccent: '#000',
        selectionBackground: 'rgba(0,255,65,0.18)',
      },
    });
    term = t;
    fit = new FitAddon();
    t.loadAddon(fit);
    t.open(termHost);
    if (termHost) fit.fit();

    void (async () => {
      openBoot(); // natural-flow: append frame → header → 6 module rows
      dashAttached = true;
      booted = true;
      void openDashStream();
    })();

    const ro = new ResizeObserver(() => {
      if (fit && term) {
        fit.fit();
        if (booted && !sending && !spinnerActive) {
          renderCurrentComposer();
        }
      }
    });
    if (termHost) ro.observe(termHost);

    const onDocClick = (e: MouseEvent) => {
      if (spinOpen && spinPickBox && !spinPickBox.contains(e.target as Node)) spinOpen = false;
    };
    document.addEventListener('click', onDocClick, true);

    return () => {
      ro.disconnect();
      document.removeEventListener('click', onDocClick, true);
      t.dispose();
      term = null;
    };
  });

  // ── input (COMPOSER: CUP per key — no drift) ───────────────────────────────
  function onInputEdit(e: Event): void {
    typedText = (e.target as HTMLInputElement).value;
    // Re-render the ENTIRE current row from CUP col 1 (drift fix: we ALWAYS
    // start at column 1, so the ❯ marker never shifts rightward vs the grid).
    renderCurrentComposer();
  }
  function onInputKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }
  function onTermClick(e: MouseEvent) {
    const tgt = e.target as HTMLElement | null;
    if (!tgt) return;
    if (tgt === inputEl) return;
    if (tgt.closest('button, a, select, textarea, .spinner-pick, .term-input')) return;
    focusInput();
  }

  // ── send ───────────────────────────────────────────────────────────────────
  async function send(): Promise<void> {
    const text = typedText.trim();
    // Gate on the stream being live (sseinit+ready seen) — a send before the
    // handshake has a tag would 400 (attach first). The user line still
    // commits to the transcript so nothing is lost; the POST retries on the
    // next send if the stream isn't up yet.
    if (text.length === 0 || sending || spinnerActive) return;
    // COMMIT the user send line as a PRINT (user/manual line) — the final
    // line + spinner contract (the existing e2dd587 behavior).
    printUserLine(text);
    // Clear the held input value so the composer resets.
    if (inputEl) inputEl.value = '';
    sending = true;
    spinnerActive = false;
    step = 'posting';
    history.push({
      user: text, reasoningChars: 0, content: '', open: true,
      thinking: false, firstByte: false, reqId: null, error: null,
    });
    // The committed user line already scrolled to the tail; the composer is
    // that tail row now — re-address it and clear it. NO explicit scroll.
    typedText = '';
    renderCurrentComposer();

    const c = new AbortController();
    try {
      // One-shot POST (does NOT stay open): the tag routes it onto the SSE
      // GET's session; the 202 is a mere receipt and the transcript rides the
      // open SSE stream (openDashStream). We read the small JSON body then
      // close — no long-held connection.
      const res = await fetch(DASH_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dash-session': connTag,
        },
        body: JSON.stringify({ msg: text, session: connTag }),
        signal: c.signal,
      });
      const body = await res.text().catch(() => '');
      if (!res.ok) {
        printError(body.slice(0, 120) || ('HTTP ' + res.status));
      }
      step = 'idle';
    } catch (err) {
      const aborted = (err as { name?: string } | null | undefined)?.name === 'AbortError';
      const e = history[history.length - 1];
      if (e && !aborted) e.error = (err as { message?: string })?.message ?? String(err);
      if (!aborted) {
        printError((err as { message?: string })?.message ?? 'stream error');
      }
      step = 'idle';
    } finally {
      sending = false;
      spinnerActive = false;
      focusInput();
    }
  }
</script>

<div class="page">
  <div class="terminal-col">
    <div class="terminal" onclick={onTermClick}>
      <span
        class="lamp lamp-{step}"
        role="button"
        aria-live="polite"
        tabindex="0"
        title={step.toUpperCase()}
      >
        {step.toUpperCase()}
      </span>
      <div class="term-host" bind:this={termHost}>
        <input
          class="term-input"
          bind:this={inputEl}
          type="text"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          value={typedText}
          oninput={onInputEdit}
          onkeydown={onInputKeyDown}
          placeholder=""
          aria-label="terminal input"
        />
      </div>
    </div>
    <div class="hud-strip">
      <div class="hud-cell" title="TTFT P90 ms and CRS P90 tokens/s">
        <span class="hud-label">TTFT P90</span>
        <span class="hud-value">{huds.ttft !== null ? huds.ttft.toFixed(0) : '—'}</span>
        <span class="hud-label csep">CRS P90</span>
        <span class="hud-value trav">{huds.tspk !== null ? huds.tspk.toFixed(1) : '—'}</span>
        <span class="hud-label">t/s</span>
      </div>
      <div class="hud-cell" title="Bus flow: last 60 frames, bright lane">
        <span class="hud-label">FLOW</span>
        <svg class="spark" width="260" height="24" viewBox="0 0 260 24" preserveAspectRatio="none">
          {#if huds.flow.length > 1}
            {#each huds.flow.slice(-FLOW_MAX) as v, i (i)}
              <line
                x1={i * (260 / FLOW_MAX)}
                y1={24}
                x2={i * (260 / FLOW_MAX) + 2}
                y2={24 - Math.min(22, v * 2)}
                stroke="#39ff14"
                stroke-width="1.5"
              />
            {/each}
          {/if}
        </svg>
        <span class="hud-value flow-seq">{huds.comp}</span>
      </div>
      <div class="hud-cell" title="vLLM pressure (server-poll, 1Hz)">
        <span class="hud-label">VRAM</span>
        <span class="hud-value vram">{huds.vram !== null ? huds.vram.toFixed(2) : '—'}</span>
        <span class="hud-label vram-src">{huds.vramSrc}</span>
      </div>
    </div>
  </div>
  <div class="params">
    <div class="param-row">
      <span class="param-label">spinner</span>
      <div class="spinner-pick" bind:this={spinPickBox}>
        <button
          class="spinner-pick-head"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={spinOpen}
          onclick={() => (spinOpen = !spinOpen)}
        >
          <span class="spinner-pick-name">{spinnerById(spinnerId).label}</span>
          <span class="spinner-pick-chev">{spinOpen ? '▾' : '▸'}</span>
        </button>
        {#if spinOpen}
          <ul class="spinner-pick-list" role="listbox">
            {#each spinners as s (s.id)}
              <li
                class="spinner-pick-row"
                class:selected={s.id === spinnerId}
                role="option"
                aria-selected={s.id === spinnerId}
                onclick={() => { setSpinner(s.id); spinOpen = false; inputEl?.focus(); }}
              >
                <span class="spinner-pick-name">{s.label}</span>
                <span class="spinner-pick-prev mono-font">{previewFrame(s)}</span>
                <span class="spinner-pick-int">{s.interval}ms</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
    <p class="wire-line">
      <span class="param-label">wire</span>
      /dash SSE multiplex · GET attach + POST send
    </p>
    <p class="wire-line">
      <span class="param-label">build</span>
      ROM {romText()} · MEM {memText()} · xterm {XTERM_VERSION}
    </p>
  </div>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: 60% 40%;
    gap: 8px;
    height: 100vh;
    padding: 8px;
    box-sizing: border-box;
    overflow: hidden;
  }
  .terminal-col {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .terminal {
    display: flex;
    flex: 1;
    flex-direction: column;
    background: #000;
    border-radius: 8px;
    padding: 8px;
    min-height: 0;
    position: relative;
    overflow: hidden;
    font-family: var(--mono);
  }
  .term-host {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
  }
  .term-input {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: 0;
    border: 0;
    opacity: 0;
    overflow: hidden;
    white-space: nowrap;
    background: transparent;
    color: transparent;
    outline: none;
    pointer-events: none;
  }
  .lamp {
    position: absolute;
    top: 16px;
    right: 16px;
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e5484d;
    font-size: 0;
    z-index: 3;
    outline: none;
  }
  .lamp-idle { background-color: #39ff14; }
  .lamp-posting { background-color: #d29922; }
  .lamp-receiving { background-color: #3fb950; }
  .lamp:focus-visible,
  .lamp:hover {
    font-size: 9px;
    color: #0f3d1a;
  }
  .hud-strip {
    display: flex;
    height: 36px;
    background: #0d1117;
    border-radius: 0 0 8px 8px;
    border-top: 1px solid #21262d;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 11px;
  }
  .hud-cell {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-right: 1px solid #21262d;
    font-family: var(--mono);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
  }
  .hud-cell:last-child { border-right: none; }
  .hud-label {
    color: #8b949e;
    font-size: 10px;
    margin-right: 2px;
    text-transform: uppercase;
    /* SPCPECTRA chrome face (self-hosted Orbitron, baked) */
    font-family: var(--chrome);
    letter-spacing: 0.5px;
  }
  .csep { margin-left: 8px; }
  .vram-src { color: #8b949e; font-size: 9px; margin-left: 6px; }
  .hud-value {
    color: #e6edf3;
    font-weight: 600;
  }
  .hud-value.trav { color: #a78bfa; }
  .hud-value.vram { color: #5eead4; }
  .hud-value.flow-seq { color: #39ff14; min-width: 18px; }
  .spark { flex-shrink: 0; }
  .params {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: #0d1117;
    border-radius: 8px;
    color: #e6edf3;
    font-family: var(--mono);
    font-size: 12px;
    overflow-y: auto;
  }
  .param-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .param-label {
    color: #8b949e;
    font-size: 11px;
    min-width: 90px;
    /* SPCPECTRA chrome face (self-hosted Orbitron, baked) */
    font-family: var(--chrome);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .spinner-pick { position: relative; flex: 1; }
  .spinner-pick-head {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #000;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 6px 10px;
    color: #e6edf3;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .spinner-pick-chev { color: #8b949e; font-size: 10px; }
  .spinner-pick-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    z-index: 50;
    list-style: none;
  }
  .spinner-pick-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    cursor: pointer;
    color: #e6edf3;
  }
  .spinner-pick-row:hover { background: #21262d; }
  .spinner-pick-row.selected { background: #1f3b6f; }
  .spinner-pick-name { flex: 1; font-size: 12px; }
  .spinner-pick-prev { color: #5eead4; font-size: 12px; }
  .spinner-pick-int { color: #8b949e; font-size: 10px; }
  .mono-font { font-family: var(--mono); }
  .wire-line {
    color: #8b949e;
    font-size: 11px;
    line-height: 1.4;
    margin-top: 8px;
  }
</style>
