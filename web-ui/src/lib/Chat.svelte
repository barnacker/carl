<script lang="ts">
  import { onMount } from 'svelte';
  import { spinners, spinnerById, DEFAULT_SPINNER_ID } from './spinners';

  const CHAT_ENDPOINT = '/chat';
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

  // Visible, editable request parameters (everything sent to vLLM).
  let model = $state(DEFAULT_MODEL);
  let temperature = $state('1.0');
  let top_p = $state('1.0');
  let max_tokens = $state('');

  function scrollTerminal() {
    if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
  }

  // Auto-scroll pin: follow while the operator is at the bottom of the
  // pane; back off when they scroll up (never yank them back down).
  let followBottom = $state(true);
  function onHistScroll() {
    if (terminalEl) {
      followBottom = terminalEl.scrollHeight - terminalEl.scrollTop - terminalEl.clientHeight < 24;
      if (followBottom) scrollTerminal();
    }
  }
  function scrollIfPinned() {
    if (followBottom) scrollTerminal();
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

  onMount(focusInput);

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
  <div class="terminal">
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
          <div class="term-user"><span class="marker">«</span><span class="user-text">{entry.user}</span></div>
          {#if entry.firstByte || entry.content.length > 0}
            <div class="term-content" class:open-stream={entry.open}>
              <span class="marker">»</span><span class="content-text">
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
      <span class="param-label">spinner</span>
      <select class="param-input" value={spinnerId} onchange={(e) => setSpinner((e.target as HTMLSelectElement).value)}>
        {#each spinners as s (s.id)}
          <option value={s.id}>{s.label} ({s.id})</option>
        {/each}
      </select>
    </label>
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
  .spinner-frame {
    /* exactly one monospace cell wide. The frame chars are single-width
       (per-set verified against the reference 'o' advance in the host
       font — see spinners.ts), and the 1ch box guarantees no line shift
       even if a glyph fell to a wider fallback. */
    display: inline-block;
    width: 1ch;
  }
  .spinner {
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.25;
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
  /* Prompt row containment (DOM-stub root cause, scratch dir): the prompt
     row is flex 0 0 auto and the textarea a fixed 1.25em line box, so the
     row can never grow to absorb history content — history grows inside
     the scroll container and the prompt rect is identical before/after a
     new entry appends (measured: 451.5→477 in all variants). The remaining
     "not terminal-like" behavior was the scroll view: fixing the view to
     the bottom only while already at the bottom (auto-scroll pin) and
     never yanking the operator back down after a manual scroll-up. */
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
