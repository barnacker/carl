<script lang="ts">
  import { onMount } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import type { Spinner } from './spinners';
  import { spinners, spinnerById, DEFAULT_SPINNER_ID } from './spinners';

  const CHAT_ENDPOINT = '/chat';
  const TELEMETRY_ENDPOINT = '/telemetry';
  const VERSION_JSON = '/_app/version.json';
  const DEFAULT_MODEL = 'Qwen/Qwen3.8-27B-FP8';
  const SPINNER_KEY = 'carl.spinner';

  const MONO_CHAIN =
    "'Cascadia Code', 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace";

  // Erase-in-line (full): the single primitive that guarantees the spinner
  // and the marker can never coexist on the same row — every in-place print
  // (spinner frame, first content frame, re-rendered prompt) clears the line
  // BEFORE writing. (Brief contract #2 & #8.)
  const CLEAR_LINE = '\x1b[2K';

  type Entry = {
    user: string;
    reasoning: string;
    content: string;
    open: boolean;
    thinking: boolean;
    firstByte: boolean;
    reqId: string | null;
    error: string | null;
  };

  function loadSpinner(): string {
    try {
      const v = localStorage.getItem(SPINNER_KEY);
      if (v && spinners.some((s) => s.id === v)) return v;
    } catch {
      /* storage unavailable — fall through to default */
    }
    return DEFAULT_SPINNER_ID;
  }

  let spinnerId = $state(loadSpinner());
  function setSpinner(v: string) {
    spinnerId = v;
    try {
      localStorage.setItem(SPINNER_KEY, v);
    } catch {
      /* non-fatal */
    }
  }

  // --- spinner pickbox (live-preview dropdown) --------------------------
  // Unchanged from base: one shared rAF loop drives all option rows at each
  // set's own interval scaled 2x slower; a single shared $state counter
  // invalidates the list once per tick batch (O(visible rows) per frame).
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
      const dt = Math.min(now - last, 250); // clamp: tab-wake / time jumps
      last = now;
      for (let r = 0; r < previewState.length; r++) {
        const st = previewState[r];
        st.next -= dt;
        if (st.next <= 0) {
          st.i = (st.i + 1) % spinners[r].frames.length;
          st.next += st.int;
          previewTicks++; // one shared invalidation per flip batch
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
  // Template reads previewState (a $state array) through previewFrame();
  // a mutation of a row's .i re-renders exactly that row's text.
  function previewFrame(s: Spinner): string {
    const st = previewState[spinners.indexOf(s)];
    return s.frames[st.i] ?? s.frames[0] ?? '';
  }

  // --- xterm terminal: the app is a PRINT client ------------------------
  // The terminal IS a line buffer + cursor (operator's law):
  //   user send         -> write("❮ text\r\n")        [sent line prints]
  //   thinking starts   -> spinner frames printed IN PLACE on the thinking
  //                        row (clear line + write frame per tick; the cursor
  //                        is ALREADY on that row — no per-row pointer)
  //   first content     -> clear line + write("❯ first token")
  //   later content     -> write(token)  (flows after "❯ ", wraps natively)
  //   done              -> write("\r\n") + fresh prompt on the new bottom row
  // The line the cursor is on is always the active row (xterm maintains the
  // cursor as we print); we never need a separate row pointer. The live row
  // is simply the terminal's current cursor row, which after each "*writeln"
  // is the (new) bottom row — that is what bottom-hug means structurally.
  let termHost: HTMLDivElement;
  let term: Terminal | null = null;
  let fit: FitAddon | null = null;
  let inputEl: HTMLInputElement;
  let booted = false;   // banner printed + prompt shown at least once

  // Marker params (shipped in 16dda7f; localStorage, plain text, <=8 chars).
  const USER_MARKER_KEY = 'carl.userMarker';
  const ASSISTANT_MARKER_KEY = 'carl.assistantMarker';
  function loadMarker(key: string, fallback: string): string {
    try {
      const v = localStorage.getItem(key);
      if (v !== null && v !== '') return v.slice(0, 8);
    } catch {
      /* non-fatal */
    }
    return fallback;
  }
  let userMarker = $state(loadMarker(USER_MARKER_KEY, '❮'));
  let assistantMarker = $state(loadMarker(ASSISTANT_MARKER_KEY, '❯'));
  function setUserMarker(v: string) {
    userMarker = v.slice(0, 8);
    try { localStorage.setItem(USER_MARKER_KEY, userMarker); } catch { /* non-fatal */ }
  }
  function setAssistantMarker(v: string) {
    assistantMarker = v.slice(0, 8);
    try { localStorage.setItem(ASSISTANT_MARKER_KEY, assistantMarker); } catch { /* non-fatal */ }
  }

  // --- editing buffer (the hidden input's value, mirrored to the prompt) --
  let editBuf = $state('');

  // Print the current prompt line (in place, col 0 of the current row). The
  // hidden input owns the keystrokes; we re-print the prompt line from
  // editBuf on every input so the grid stays authoritative for position while
  // a real <input> handles IME/typing. (Brief contract #5 — "input field
  // someone coded for you" hybrid.)
  function showPrompt(): void {
    if (!term) return;
    term.write(CLEAR_LINE + userMarker + ' ' + editBuf);
    // xterm's native block cursor now sits after "marker + edit buffer",
    // blinking as a real terminal caret.
  }

  // Re-render the prompt line live as the operator types or when a marker
  // glyph is edited at runtime. (xterm owns the grid; Svelte only tracks the
  // edit buffer, never the grid itself — the operator's "no per-token grid
  // re-render" rule.)
  $effect(() => {
    void editBuf;
    if (!term || !booted) return;
    if (sending) return; // during a send the live row is content, not prompt
    showPrompt();
  });

  // --- the print primitives ---------------------------------------------

  // Seed the bottom-hug BEFORE the banner: fill (rows-1) blank lines so the
  // first print (the banner's title) lands on the BOTTOM row. This is the
  // operator's load-bearing invariant — the terminal is NOT top-aligned;
  // the leading blanks are the pad that makes the tail hug the bottom.
  function seedPad(): void {
    if (!term) return;
    const rows = term.rows;
    if (rows > 1) term.write('\r\n'.repeat(rows - 1));
  }

  // After the banner (9 lines) has printed at the buffer top, pad blank lines
  // so the PROMPT lands on the bottom row. (Brief banner rule 3.) When the
  // buffer later exceeds `rows`, xterm's native scroll pushes the banner's
  // top lines into scrollback and the tail keeps hugging the bottom.
  function padToBottomRows(consumedLines: number): void {
    if (!term) return;
    const r = term.rows;
    const fill = r - 1 - consumedLines;
    if (fill > 0) term.write('\r\n'.repeat(fill));
    term.scrollToBottom();
  }

  // Print the boot banner (operator-approved, 10-line block; version read at
  // print time from the build version.json). Mechanism chosen: staged
  // SEQUENTIAL print — each line prints after a short delay so it reads like
  // a real boot; the "OK" statuses are printed only AFTER at least one SSE
  // stream has attached successfully (the attach success proves the chain).
  async function printBanner(): Promise<void> {
    if (!term) return;
    const ver = await getBootVersion();
    const lines = [
      '  CARL \u2500\u2500 PROVISIONING TERMINAL v' + ver,
      '  > nervous system ....... OK',
      '  > telemetry faculty .... OK',
      '  > cortex ............... OK',
      '  > llm faculty .......... OK',
      '  > chat faculty ......... OK',
      '',
      '  BOOT SEQ\u2026 OK          GATE\u2026 OK         LINK\u2026 OK',
      '  \u2500'.repeat(1).slice(0, 2) + '\u2500'.repeat(40),
    ];
    for (const ln of lines) {
      term.writeln(ln);
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  async function getBootVersion(): Promise<string> {
    try {
      const r = await fetch(VERSION_JSON);
      if (r.ok) {
        const j = (await r.json()) as { version?: string };
        const v = String(j.version ?? '');
        return v.length > 10 ? v.slice(0, 10) : v; // short form (first 10 digits if long)
      }
    } catch {
      /* non-fatal */
    }
    return '0.1.0';
  }

  // User sends "text": REPLACE the current prompt row with the sent line
  // "❮ text" and open a NEW row (the thinking row) at the bottom.
  function printUserLine(text: string): void {
    if (!term) return;
    term.write(CLEAR_LINE + userMarker + ' ' + text + '\r\n');
  }

  // Thinking: the cursor is on the thinking row (the row the user-write's
  // "\r\n" opened, at the bottom). Each tick prints the frame IN PLACE:
  // clear the line, write the frame. No marker on this row (contract #8 —
  // guaranteed: the line is cleared before every write).
  function printSpinnerFrame(frame: string): void {
    if (!term) return;
    term.write(CLEAR_LINE + ' ' + frame + ' ');
  }

  // First content frame: the cursor is still on the thinking row. Clear it
  // and write "❯ " + first token on the SAME line. Later tokens flow from
  // the cursor (naturally wrapping), so the marker stays pinned to col 0 of
  // this row.
  function printFirstContentFrame(tok: string): void {
    if (!term) return;
    term.write(CLEAR_LINE + assistantMarker + ' ' + tok);
  }
  function printContentToken(tok: string): void {
    if (!term) return;
    term.write(tok);
  }

  // Done: open a fresh bottom row and print the prompt on it. The content we
  // just printed is now frozen in the buffer (it's the line above, or in
  // scrollback if it wrapped past the viewport).
  function printDone(): void {
    if (!term) return;
    term.write('\r\n');
    term.scrollToBottom();
    showPrompt();
  }

  // Error: one "E <msg>" line (the shipped E {error} convention), then a
  // fresh prompt. Kept to one logical line.
  function printError(msg: string): void {
    if (!term) return;
    term.write('\r\n');
    term.writeln('E ' + msg);
    term.write('\r\n');
    term.scrollToBottom();
    showPrompt();
  }

  function focusInput() {
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      }
    }, 0);
  }

  // --- request stream (SSE) + thinking state source ---------------------
  let history = $state<Entry[]>([]);
  let sending = $state(false);
  let rendererBusy = $state(false);
  let spinnerActive = $state(false); // live row is the "thinking" row (spinner)
  let streamDone = $state(false);
  let step = $state<'idle' | 'posting' | 'receiving'>('idle');
  let controller: AbortController | null = null;
  let lastFirstByte: number | null = null;
  let lastLastByte: number | null = null;
  let activeRequestId: string | null = null;
  let spinnerFrame = $state(spinnerById(loadSpinner()).frames[0]);

  // The thinking-row property the spinner ticker keys off: when the live row
  // is the thinking row (spinnerActive true), the ticker's frame advance
  // reprints it IN PLACE. The swap to content happens on the FIRST
  // lane:content frame (structural — spinnerActive goes false in the same
  // update, so spinner and marker can never coexist).
  $effect(() => {
    const set = spinnerById(spinnerId);
    const int = set.interval > 0 ? set.interval : 100;
    spinnerFrame = set.frames[0] ?? spinnerFrame;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % Math.max(1, set.frames.length);
      spinnerFrame = set.frames[i] ?? spinnerFrame;
      if (spinnerActive) printSpinnerFrame(spinnerFrame); // in-place overwrite
    }, int);
    return () => clearInterval(t);
  });

  // Telemetry stream (slice D, PRESERVED from the base commit): the
  // thinking-state source. state:'reasoning' flips spinnerActive on the first
  // reasoning frame of a request that hasn't seen content. We do NOT touch
  // the telemetry wire — only how the thinking SIGNAL drives a print.
  let telemetryController: AbortController | null = null;
  async function openTelemetryStream() {
    if (telemetryController) return;
    const c = new AbortController();
    telemetryController = c;
    try {
      const res = await fetch(TELEMETRY_ENDPOINT, { signal: c.signal });
      if (!res.ok || !res.body) return;
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
            if (!t.startsWith('data:')) continue; // skip comment frames (": ...")
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            let parsed: { id?: string; state?: 'reasoning' | 'content' | 'done' } | null = null;
            try { parsed = JSON.parse(payload) as typeof parsed; } catch { continue; }
            if (!parsed || typeof parsed !== 'object') continue;
            const id = parsed.id ?? null;
            if (id && activeRequestId && id !== activeRequestId) continue; // stale frame
            const e = (id && history.find((x) => x.reqId === id)) || history[history.length - 1];
            if (!e) continue;
            if (id && e.reqId === null) e.reqId = id;
            if (parsed.state === 'reasoning') {
              // New thinking source: flip the spinner on the first reasoning
              // frame from the telemetry lane (same structural gate as base —
              // open entry + no content yet — just a different data source).
              if (e.open && e.reasoning.length === 0 && lastFirstByte === null && !spinnerActive) {
                e.thinking = true;
                spinnerActive = true;
                step = step === 'posting' ? 'receiving' : step;
                printSpinnerFrame(spinnerFrame);
              }
            }
            // 'content' / 'done' are no-ops here — the /chat stream owns those.
          }
        }
      }
    } catch {
      /* stream closed (page unload or abort) — non-fatal */
    } finally {
      telemetryController = null;
    }
  }

  // Reopen the telemetry stream on mount so it's live for the first send AND
  // so its successful attach is the signal that gates the banner's "OK"
  // statuses (brief banner rule 2).
  let telemetryAttached = $state(false);

  // Visible, editable request parameters (everything sent to vLLM).
  let model = $state(DEFAULT_MODEL);
  let temperature = $state('1.0');
  let top_p = $state('1.0');
  let max_tokens = $state('');

  function applyToken(lane: 'reasoning' | 'content', text: string, id: string | null) {
    if (text.length === 0) return;
    let e: Entry | undefined;
    if (id) {
      if (activeRequestId === null) activeRequestId = id;
      if (id !== activeRequestId) return; // stale/late frame from another request
      e = history.find((x) => x.reqId === id);
    }
    if (!e) e = history[history.length - 1];
    if (!e) return;
    if (e.reqId === null && id) e.reqId = id;
    if (lane === 'reasoning') {
      if (e.reasoning.length === 0 && lastFirstByte === null) e.thinking = true;
      e.reasoning += text;
    } else {
      // First lane:content frame — structural spinner→marker swap: clear the
      // spinner row and write "❯ first token" in the SAME update, so the
      // spinner and the marker can never share a line.
      if (!e.firstByte) {
        e.firstByte = true;
        e.thinking = false;
        spinnerActive = false;
        if (e.open) e.open = false;
        printFirstContentFrame(text);
      } else {
        printContentToken(text);
      }
      e.content += text;
    }
    if (lastFirstByte === null) lastFirstByte = Date.now();
    if (step === 'posting') step = 'receiving';
    term?.scrollToBottom();
  }

  function doneStream(id: string | null) {
    const e = (id && history.find((x) => x.reqId === id)) || history[history.length - 1];
    if (e) e.open = false;
    if (!id || activeRequestId === id) activeRequestId = null;
    streamDone = true;
    if (lastLastByte === null) lastLastByte = Date.now();
    spinnerActive = false;
  }

  // --- mount: create xterm, attach, print the boot banner + prompt -------
  onMount(() => {
    const t = new Terminal({
      convertEol: false,
      disableStdin: true, // we own input via the hidden <input>; xterm's stdin
                          // is not a second source of truth
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: MONO_CHAIN,
      fontSize: 14,
      lineHeight: 1.25,
      letterSpacing: 0,
      scrollback: 10000,
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
    if (termHost) fit?.fit();

    // The "ATTACH" the banner's OK statuses are gated on succeeds once the
    // perpetual /telemetry stream opens (the operator's chain: NS ->
    // telemetry -> cortex -> llm -> chat all live behind the same origin).
    void openTelemetryStream().then(() => {
      telemetryAttached = true;
      void attachAndBoot(t);
    }).catch(() => {
      // Telemetry attach failed (server briefly down, offline) — still boot
      // the terminal; the banner still prints (it's a print client, and the
      // statuses are informational, not a hard gate). We print them anyway
      // because the OCCAM' brand read is "the page came up"; the server
      // uptime is visible in the lamp when a request actually fails.
      telemetryAttached = false;
      void attachAndBoot(t);
    });

    const onDocClick = (e: MouseEvent) => {
      if (spinOpen && spinPickBox && !spinPickBox.contains(e.target as Node)) spinOpen = false;
    };
    document.addEventListener('click', onDocClick, true);
    const ro = new ResizeObserver(() => {
      if (fit && term) {
        fit.fit();
        term.scrollToBottom();
        if (booted && !sending && spinnerActive === false) showPrompt();
      }
    });
    if (termHost) ro.observe(termHost);

    return () => {
      ro.disconnect();
      document.removeEventListener('click', onDocClick, true);
      t.dispose();
      term = null;
    };
  });

  async function attachAndBoot(t: Terminal): Promise<void> {
    if (booted) return;
    booted = true;
    seedPad();           // bottom-hug seed: (rows-1) blanks (contract #3)
    term = t;
    await printBanner(); // boot banner at the buffer top (rule: print before prompt)
    padToBottomRows(9);  // banner consumes 9 lines; pad the prompt to bottom row
    showPrompt();        // the live prompt with the caret
    focusInput();
  }

  // --- input (hybrid) ----------------------------------------------
  function onInputEdit(e: Event) {
    editBuf = (e.target as HTMLInputElement).value;
    showPrompt(); // re-render the prompt line from the edit buffer (in place)
  }
  function onInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    } else if (e.key === 'Enter' && e.shiftKey) {
      // The prompt is a single print line (the operator's contract: the sent
      // line prints as "❮ text\r\n" — no in-prompt newline). Shift+Enter is a
      // no-op (documented; matches a real terminal prompt's single-line edit).
    }
  }

  // Click ANYWHERE in the terminal = focus the input (and re-attach the
  // viewport to the bottom). xterm's own click re-attaches near the bottom;
  // we focus the input regardless (contract #5).
  function onTermClick(e: MouseEvent) {
    const tgt = e.target as HTMLElement | null;
    if (!tgt) return;
    if (tgt === inputEl) return;
    if (tgt.closest('button, a, select, textarea, .spinner-pick, .term-input')) return;
    focusInput();
  }

  async function send() {
    const text = editBuf.trim();
    if (text.length === 0 || sending || spinnerActive) return;
    editBuf = '';
    if (inputEl) inputEl.value = '';
    sending = true;
    rendererBusy = true;
    spinnerActive = false;
    step = 'posting';
    lastFirstByte = null;
    lastLastByte = null;
    streamDone = false;
    history.push({ user: text, reasoning: '', content: '', open: true, thinking: false, firstByte: false, reqId: null, error: null });

    printUserLine(text); // commit the sent line as a PRINT (contract #2)
    term?.scrollToBottom();

    controller = new AbortController();
    try {
      const messages: { role: 'user'; content: string }[] = [{ role: 'user', content: text }];
      const body: Record<string, unknown> = { model, messages };
      const temp = parseFloat(temperature);
      if (!Number.isNaN(temp) && temp > 0) body.temperature = temp;
      const tp = parseFloat(top_p);
      if (!Number.isNaN(tp) && tp > 0) body.top_p = tp;
      const mt = parseInt(max_tokens, 10);
      if (!Number.isNaN(mt) && mt > 0) body.max_tokens = mt;

      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf8');
      let buf = '';
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(chunk, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const frameMsg = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          for (const line of frameMsg.split('\n')) {
            const tt = line.trim();
            if (!tt.startsWith('data:')) continue;
            const payload = tt.slice(5).trim();
            if (payload === '[DONE]') { step = 'idle'; continue; }
            let parsed: { type?: string; lane?: 'reasoning' | 'content'; text?: string; message?: string; id?: string } | null = null;
            try { parsed = JSON.parse(payload) as typeof parsed; } catch { parsed = null; }
            if (
              parsed &&
              parsed.type === 'token' &&
              (parsed.lane === 'reasoning' || parsed.lane === 'content') &&
              typeof parsed.text === 'string'
            ) {
              applyToken(parsed.lane, parsed.text, parsed.id ?? null);
            } else if (parsed && parsed.type === 'error') {
              const e = history.find((x) => x.reqId === parsed.id) ?? history[history.length - 1];
              if (e) e.error = parsed.message ?? 'unknown error';
              printError(parsed.message ?? 'unknown error');
              doneStream(parsed.id ?? null);
            }
          }
        }
      }
      doneStream(activeRequestId ?? null);
      // Close out on clean EOF: always print a fresh prompt (even on the
      // zero-reasoning + zero-content path where no content frames arrived —
      // the spinner row is cleared and replaced by a clean prompt).
      step = 'idle';
      printDone();
      activeRequestId = null;
    } catch (err) {
      const aborted = (err as { name?: string } | null | undefined)?.name === 'AbortError';
      const e = history.find((x) => x.reqId === activeRequestId) ?? history[history.length - 1];
      if (e && !aborted) e.error = err?.message ?? String(err);
      if (!aborted) printError((err as { message?: string } | null)?.message ?? 'stream error');
      step = 'idle';
      doneStream(activeRequestId ?? null);
    } finally {
      sending = false;
      rendererBusy = false;
      spinnerActive = false;
      controller = null;
      term?.scrollToBottom();
      showPrompt();
      focusInput();
    }
  }
</script>

<div class="page">
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
      <!-- xterm.open() fills this node with its own DOM (the grid, scrollbar,
           viewport). The *hidden* input sits absolutely on top; it is the
           keyboard/IME source while xterm's visible block caret is the position
           authority (the "input field someone coded for you" hybrid). -->
      <input
        class="term-input"
        bind:this={inputEl}
        type="text"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        value={editBuf}
        oninput={onInputEdit}
        onkeydown={onInputKeyDown}
        placeholder=""
        aria-label="terminal input"
      />
    </div>
  </div>
  <div class="params">
    <label class="param-row">
      <span class="param-label">model</span>
      <input class="param-input" bind:value={model} type="text" autocomplete="off" />
    </label>
    <label class="param-row">
      <span class="param-label">temperature</span>
      <input class="param-input" bind:value={temperature} type="number" step="0.1" />
    </label>
    <label class="param-row">
      <span class="param-label">top_p</span>
      <input class="param-input" bind:value={top_p} type="number" step="0.01" />
    </label>
    <label class="param-row">
      <span class="param-label">max_tokens</span>
      <input class="param-input" bind:value={max_tokens} type="number" placeholder="(empty → omit)" />
    </label>
    <label class="param-row">
      <span class="param-label">user marker</span>
      <input class="param-input" bind:value={userMarker} type="text" maxlength="8" autocomplete="off" oninput={() => setUserMarker(userMarker)} />
    </label>
    <label class="param-row">
      <span class="param-label">assistant marker</span>
      <input class="param-input" bind:value={assistantMarker} type="text" maxlength="8" autocomplete="off" oninput={() => setAssistantMarker(assistantMarker)} />
    </label>
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
      POST /chat · content-type: application/json · accept: text/event-stream · auth: none
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
  .terminal {
    display: flex;
    flex-direction: column;
    background: #000;
    border-radius: 8px;
    padding: 8px;
    min-height: 0;
    position: relative;
    overflow: hidden;
    font-family: var(--mono);
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
    color: transparent;
    outline: none;
    z-index: 3;
  }
  .lamp-idle { background-color: #e5484d; }
  .lamp-posting { background-color: #d29922; }
  .lamp-receiving { background-color: #3fb950; }
  .lamp:focus-visible,
  .lamp:hover {
    font-size: 9px;
    color: #0f3d1a;
  }
  /* The xterm host fills the whole pane; xterm.open() paints its own grid
     + viewport + scrollbar inside it. Position absolute so xterm's internal
     layout isn't fought by the flex parent. */
  .term-host {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
  }
  /* xterm places its own .xterm element inside .term-host; xterm.js colours
     come from the Terminal options.theme (set in onMount), not scoped CSS,
     because Svelte 5 scope-tags CSS which can't reach xterm's injected DOM. */
  /* The hidden <input>: visually zero-sized (1px, opacity 0) and absolutely
     reserved for keyboard capture; it does NOT paint a box on the grid.
     display:none would break focus(), so we keep it renderable but off the
     visual path — xterm's visible block caret is the position authority. */
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
  .params {
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-radius: 8px;
    border-left: 2px solid var(--accent);
    padding: 12px;
    min-height: 0;
    overflow-y: auto;
  }
  .param-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 4px;
  }
  .param-label {
    flex: 0 0 130px;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .param-input {
    flex: 1;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--ink);
    font-family: var(--mono);
    font-size: 13px;
    outline: none;
  }
  .param-input:focus {
    border-color: var(--accent);
  }
  .spinner-pick {
    flex: 1;
    position: relative;
  }
  .spinner-pick-head {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--ink);
    font-family: var(--mono);
    font-size: 13px;
    cursor: pointer;
  }
  .spinner-pick-head:focus-visible {
    outline: none;
    border-color: var(--accent);
  }
  .spinner-pick-chev {
    color: var(--ink-3);
    font-size: 10px;
  }
  .spinner-pick-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 280px;
    overflow-y: auto;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    z-index: 20;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  }
  .spinner-pick-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink);
    white-space: nowrap;
  }
  .spinner-pick-row:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .spinner-pick-row.selected {
    background: rgba(63, 185, 80, 0.14);
    box-shadow: inset 2px 0 0 #3fb950;
  }
  .spinner-pick-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spinner-pick-prev {
    min-width: 11ch;
    display: inline-block;
    text-align: left;
    color: #00ff41;
    white-space: pre;
  }
  .mono-font {
    font-family: var(--mono);
  }
  .spinner-pick-int {
    flex: 0 0 5ch;
    text-align: right;
    color: var(--ink-3);
    font-size: 10px;
  }
  .wire-line {
    margin: 6px 0 0;
    padding-top: 6px;
    border-top: 1px solid var(--line);
    font-family: var(--mono);
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
</style>
