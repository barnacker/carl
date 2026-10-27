<script lang="ts">
  import { onMount } from 'svelte';
  import { Spinner, spinners, spinnerById, DEFAULT_SPINNER_ID } from './spinners';

  const CHAT_ENDPOINT = '/chat';
  const TELEMETRY_ENDPOINT = '/telemetry';
  const DEFAULT_MODEL = 'Qwen/Qwen3.8-27B-FP8';
  const SPINNER_KEY = 'carl.spinner';

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
  // Every open option row shows the set name beside a live animating
  // frame. One shared rAF loop drives all rows at each set's own interval
  // scaled 2x slower (operator rule: 100+ live options must not jank the
  // params panel); a single shared $state counter invalidates the list
  // once per tick batch, so the per-frame cost is O(visible rows).
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

  // Thinking spinner state. Only one entry is open at a time (sending
  // lock), so one ticker suffices. Gating is STRUCTURAL, not a flag: while
  // rendererBusy, an entry shows the spinner only when entry.open; open
  // flips false on the same state update that first content byte sets
  // entry.thinking=false, and nothing else renders the spinner — so the
  // spinner and the marker+text branch can never both render at once,
  // and the swap happens on the first lane:content frame.
  // Ticker advances on the selected set's own interval in perpetuity
  // (cheap; the frame is consumed only when an entry asks for it).
  let spinnerFrame = $state(spinnerById(loadSpinner()).frames[0]);
  let rendererBusy = $state(false);
  $effect(() => {
    const set = spinnerById(spinnerId);
    const int = set.interval > 0 ? set.interval : 100;
    spinnerFrame = set.frames[0] ?? spinnerFrame;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % Math.max(1, set.frames.length);
      spinnerFrame = set.frames[i] ?? spinnerFrame;
    }, int);
    return () => clearInterval(t);
  });

  let history = $state<Entry[]>([]);
  let input = $state('');
  let sending = $state(false);
  let streamDone = $state(false);
  let lampState = $state<'idle' | 'posting' | 'receiving'>('idle');
  let controller: AbortController | null = null;
  let lastFirstByte: number | null = $state(null);
  let lastLastByte: number | null = $state(null);
  let activeRequestId: string | null = $state(null);
  let terminalEl: HTMLDivElement;
  let inputEl: HTMLTextAreaElement;

  // Telemetry stream (Slice D): the thinking-state source is now the /telemetry
  // SSE lane, NOT the chat stream. We open ONE perpetual /telemetry stream for
  // the page life (in onMount) and route its snapshots to the active entry.
  //   state:'reasoning'  →  entry.thinking = true  (spinner shows; NO » marker,
  //                     because entry.firstByte is still false until the FIRST
  //                     content frame from /chat arrives — same structural swap
  //                     as before, just a new source for the thinking trigger.)
  //   state:'content'    →  does NOT set thinking — the chat stream content
  //                     frames (applyToken lane:'content') drive the swap.
  //   state:'done'       →  no-op (the chat stream's done frame finalizes).
  // The telemetry stream NEVER blocks content rendering: if it lags /chat,
  // the spinner simply appears slightly late (acceptable per spec). It is a
  // separate fetch from /chat; both run in parallel.
  let telemetryController: AbortController | null = null;

  async function openTelemetryStream() {
    if (telemetryController) return; // already open
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
              // New thinking source: flip thinking on the first reasoning frame
              // from the telemetry lane (replaces the old chat-stream lane:reasoning
              // trigger — same spinner, new source).
              if (e.reasoning.length === 0 && lastFirstByte === null) e.thinking = true;
              setTimeout(scrollIfPinned, 0);
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

  // Reopen the telemetry stream on mount so it's live for the first send.

  // Visible, editable request parameters (everything sent to vLLM).
  let model = $state(DEFAULT_MODEL);
  let temperature = $state('1.0');
  let top_p = $state('1.0');
  let max_tokens = $state('');

  // Parametric terminal markers — operator-chosen glyphs rendered in
  // front of every entry line (a user line, an assistant line), persisted
  // to localStorage like the other params. Rendered as a plain text node
  // in the template, so multi-char values are legal (up to 8) and user
  // input can never be injected as HTML.
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

  function scrollTerminal() {
    if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight; // instant — terminal-like
  }

  // Auto-scroll pin (classic terminal flow: newest line at the bottom
  // edge, history scrolls UP out of view as lines arrive):
  //   - already at the bottom (within 40px)? → follow: every new entry /
  //     token lands the viewport at the bottom (instant).
  //   - user has scrolled UP? → follow off; their reading position is
  //     respected (no force-scroll). The flag stays latched: the next
  //     time they return to the bottom (scroll event within 40px) it
  //     re-engages automatically.
  let followBottom = $state(true);
  function onHistScroll() {
    if (terminalEl) {
      followBottom = terminalEl.scrollHeight - terminalEl.scrollTop - terminalEl.clientHeight < 40;
      if (followBottom) scrollTerminal();
    }
  }
  function scrollIfPinned() {
    if (followBottom) scrollTerminal();
  }

  // Terminal-region click-to-focus (operator spec): a click on ANY part of
  // the terminal area — history pane, entry rows, markers, empty space,
  // the prompt row — refocuses the prompt input. The input's own click is
  // skipped (native caret placement runs instead); interactive widgets
  // (buttons, links, the spinner pickbox) are skipped too. Wired on the
  // outer .terminal container so the single handler covers the lamp,
  // history pane, and prompt row; the params panel is a grid sibling of
  // .terminal and is never reachable from this handler.
  function onTerminalClick(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t === inputEl) return;
    if (t.closest('button, a, select, textarea, .spinner-pick')) return;
    inputEl?.focus();
  }

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
      // First lane:content frame — structural spinner→marker swap:
      // clear thinking AND close the spinner placeholder in the SAME
      // state update so the spinner can never coexist with content.
      if (!e.firstByte) { e.firstByte = true; e.thinking = false; }
      if (e.open && e.content.length === 0) {
        e.open = false;
      }
      e.content += text;
    }
    if (lastFirstByte === null) lastFirstByte = Date.now();
    if (lampState === 'posting') lampState = 'receiving';
    setTimeout(scrollIfPinned, 0);
  }

  function closeEntry(entry: Entry | undefined) {
    if (entry) entry.open = false;
  }

  // Finalize the entry for this POST (id-keyed when known) and release the id.
  function doneStream(id: string | null) {
    const e = (id && history.find((x) => x.reqId === id)) || history[history.length - 1];
    closeEntry(e);
    if (!id || activeRequestId === id) activeRequestId = null;
    streamDone = true;
    if (lastLastByte === null) lastLastByte = Date.now();
    setTimeout(scrollIfPinned, 0);
  }

  function focusInput() {
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      }
    }, 0);
  }

  onMount(() => {
    focusInput();
    void openTelemetryStream(); // perpetual /telemetry SSE — the thinking source
    // Close the spinner pickbox when the click lands outside it.
    const onDocClick = (e: MouseEvent) => {
      if (spinOpen && spinPickBox && !spinPickBox.contains(e.target as Node)) spinOpen = false;
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  });

  async function send() {
    const text = input.trim();
    if (text.length === 0 || sending) return;
    input = '';
    sending = true;
    rendererBusy = true;
    lampState = 'posting';
    lastFirstByte = null;
    lastLastByte = null;
    streamDone = false;
    followBottom = true;
    history.push({ user: text, reasoning: '', content: '', open: true, thinking: false, firstByte: false, reqId: null, error: null });
    scrollTerminal();

    controller = new AbortController();
    try {
      const messages: { role: 'user'; content: string }[] = [
        { role: 'user', content: text },
      ];

      const body: Record<string, unknown> = {
        model,
        messages,
      };
      const t = parseFloat(temperature);
      if (!Number.isNaN(t) && t > 0) body.temperature = t;
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
        const { value, done } = await reader.read();
        if (done) {
          lampState = 'idle';
          break;
        }
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const frameMsg = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          for (const line of frameMsg.split('\n')) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') {
              lampState = 'idle';
              continue;
            }
            let parsed: { type?: string; lane?: 'reasoning' | 'content'; text?: string; message?: string; id?: string } | null = null;
            try {
              parsed = JSON.parse(payload) as typeof parsed;
            } catch {
              parsed = null;
            }
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
              doneStream(parsed.id ?? null); // finalize the entry, release the id
            }
          }
        }
      }
      doneStream(activeRequestId ?? null);
      activeRequestId = null;
    } catch (err) {
      const aborted = (err as { name?: string } | null | undefined)?.name === 'AbortError';
      const e = history.find((x) => x.reqId === activeRequestId) ?? history[history.length - 1];
      if (e && !aborted) e.error = err?.message ?? String(err); // HTTP !ok + transport + faculty errors
      lampState = 'idle';                  // keep the existing reset
      doneStream(activeRequestId ?? null); // finalize the entry, release the id and sending lock (finally)
    } finally {
      sending = false;
      rendererBusy = false;
      controller = null;
      setTimeout(scrollIfPinned, 0);
      focusInput();
    }
  }
</script>

<div class="page">
  <div class="terminal" onclick={onTerminalClick}>
    <span
      class="lamp lamp-{lampState}"
      role="button"
      aria-live="polite"
      tabindex="0"
      title={lampState.toUpperCase()}
    >
      {lampState.toUpperCase()}
    </span>
    <div class="term-history" bind:this={terminalEl} aria-live="polite" onscroll={onHistScroll}>
      {#each history as entry (entry.reqId || entry)}
        <div class="term-entry">
          <div class="term-user"><span class="marker">{userMarker}</span><span class="user-text">{entry.user}</span></div>
          {#if entry.firstByte || entry.content.length > 0}
            <div class="term-content" class:open-stream={entry.open}>
              <span class="marker">{assistantMarker}</span><span class="content-text">
                {entry.content.length > 0 ? ' ' + entry.content : (entry.open ? spinnerFrame : '')}
              </span>
            </div>
          {:else if entry.open && rendererBusy}
            <div class="term-content term-placeholder" class:open-stream={entry.open}>
              <span class="spinner" aria-label="thinking">{spinnerFrame} </span>
            </div>
          {/if}
          {#if entry.error}<div class="term-error">E {entry.error}</div>{/if}
        </div>
      {/each}
    </div>
    <div class="term-prompt-row">
      <textarea
        class="term-input"
        bind:this={inputEl}
        bind:value={input}
        rows="1"
        autocomplete="off"
        spellcheck="false"
        placeholder=""
        disabled={sending}
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          } else if (e.key === 'Enter' && e.shiftKey) {
            // let the native newline flow
          }
        }}
        oninput={() => {
          // caret placement on every input
          if (inputEl) {
            inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
          }
        }}
      ></textarea>
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
  }
  .lamp {
    position: absolute;
    top: 8px;
    left: 8px;
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e5484d;
    font-size: 0;
    color: transparent;
    outline: none;
    flex-shrink: 0;
    z-index: 2;
  }
  .lamp-idle { background-color: #e5484d; }
  .lamp-posting { background-color: #d29922; }
  .lamp-receiving { background-color: #3fb950; }
  .lamp:focus-visible,
  .lamp:hover {
    font-size: 9px;
    color: #0f3d1a;
  }
  .term-history {
    /* scrollable entry list, oldest → newest top → bottom (document
       order; never reversed). flex 1 1 0 inside the .terminal column =
       it takes all remaining height ABOVE the bottom-pinned prompt row. */
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    padding: 16px 8px 8px;
  }
  .term-entry {
    margin: 0 0 10px;
  }
  .marker {
    display: inline;
    font-family: var(--mono);
  }
  .term-user {
    color: #00ff41;
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.25;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .term-user .marker {
    color: #93a6b8;
  }
  .term-content {
    color: #e6edf3;
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.25;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .term-content .marker {
    color: #5c6c7d;
  }
  .term-content.open-stream .content-text {
    color: #7ee787;
  }
  .term-placeholder {
    min-height: 1.25em;
    color: #5c6c7d;
  }
  /* Thinking-indicator frame: sets may span 1-10 cells (braille = 1,
     dna/cascade 2-4, pong 10) — per-set width is fixed and verified in
     spinners.ts, so no per-cell box is needed; white-space:pre keeps the
     frame's own spacing intact. */
  .spinner {
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.25;
    white-space: pre;
  }
  .term-error {
    color: #7a5c00;
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.25;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 2px 0 0;
  }
  /* Prompt row: the BOTTOM-MOST element of the .terminal flex column
     (after .term-history) — classic terminal position, pinned to the
     pane's bottom edge. flex 0 0 auto + fixed 1.25em line box = it
     never grows to absorb history content (prompt rect measured
     stable before/after new entry appends: 451.5→477 in the earlier
     audit). Empty state = prompt alone in the column = bottom */
  .term-prompt-row {
    flex: 0 0 auto;
  }
  .term-input {
    display: block;
    width: 100%;
    height: 1.25em;
    background: #000;
    border: none;
    padding: 0;
    margin: 0;
    color: #00ff41;
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.25;
    resize: none;
    outline: none;
    overflow: hidden;
  }
  .term-prompt-row textarea:disabled {
    opacity: 0.5;
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
