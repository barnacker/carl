<script lang="ts">
  import { onMount } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import './fonts.css';
  import type { Spinner } from './spinners';
  import { spinners, spinnerById, DEFAULT_SPINNER_ID } from './spinners';
  import { ROM_KIB, XTERM_VERSION } from './boot-consts';

  // ── DASH — the single surface ─────────────────────────────────────────────
  // One SSE stream carries ONE visible frame kind — {t:'chars', c} — plus
  // sseinit/ready/stats/flow/vram. The SPA is term.write(frame.c) ONLY (the
  // char-band contract — see docs/char-band-wire.md): no banner template,
  // no client-side dot timer, no client-side ROM/MEM calc, no client echo,
  // no client spinner. xterm.js is the kernel tty; the server owns every
  // byte on the buffer.
  const DASH_ENDPOINT = '/dash';
  const SPINNER_KEY = 'carl.spinner';

  // The BODY face (baked JetBrains Mono — self-hosted, OFL; see fonts.css).
  // The xterm instance is PURE mono for ALL terminal content (transcript +
  // stream-rendered banner), 16px + 0.3px letter-spacing locked. Orbitron is
  // chrome-only (the SPCPECTRA shell); baked per fonts.css (this font string
  // is the operator-heirloom call — the stream-rewrite does not touch it).
  const FONT_STACK =
    "'Glass', 'JetBrains Mono', 'DepartureMono', 'Cascadia Code', 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace";
  // TERMINAL GRID SPEC FINAL (operator lock): fontSize 16 + letterSpacing 0
  // (a pixel face on a fractional split breaks the monospace lattice — 0 is
  // structurally correct) + LINE_HEIGHT 1.0 (the operator's pitch-judge call:
  // D connected; A/B/C gapped — the Glass face's │ is a JetBrains-supplied
  // glyph; the panels are the pick input).
  const FONT_SIZE = 16;
  const LETTER_SPACING = 0; // xterm requires number; 0 is the operator lock
  const LINE_HEIGHT = 1.0;

  const CLEAR_LINE = '\x1b[2K';

  type Entry = {
    user: string;
    content: string;
    open: boolean;
    reasoningChars: number; // COUNT ONLY — raw reasoning stays dark
    reqId: string | null;
    error: string | null;
  };

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

  // ── TRANSCRIPT + GUIILLEMET MARKERS ────────────────────────────────────────
  // The user prompt line marker is the LEFT guillemet (U+00AB), the assistant
  // reply line marker is the RIGHT guillemet (U+00BB). Both ride the FALLBACK
  // chain (Glass lacks 00AB/00BB — the font survey shows JetBrains +
  // DepartureMono both HAVE them; the fallback renders per-glyph). Do NOT
  // change these; the operator-locked guillemets are the wire contract (the
  // server's '« …' text is what we paint via the char band).
  const USER_MARKER = '\u00AB';
  const ASSISTANT_MARKER = '\u00BB';
  const PROMPT_PREFIX = '❯';

  // ── COMPOSER (the type-drift fix) ─────────────────────────────────────────
  // THE PROMPT ROW is at a FIXED ABSOLUTE buffer Y (the row where the banner
  // ended). The char band owns cursor position (the server types; the client
  // term.writes) — the input's own DOM state is the only live feedback.
  let typedText = $state('');

  // ── the char band: the ENTIRE visible path is term.write(f.c) ONLY ───────
  // \n commits the live row into the ~15-line transcript; \b pops the last
  // char of the live-row buffer (xterm already did it on-screen).
  let liveRow = '';
  const HISTORY_MAX = 15;
  function onChars(c: string): void {
    if (!term) return;
    for (const ch of c) {
      if (ch === '\n') {
        history.push({ user: '', content: liveRow, open: false, reasoningChars: 0, reqId: null, error: null });
        while (history.length > HISTORY_MAX) history.shift();
        liveRow = '';
      } else if (ch === '\b') {
        liveRow = liveRow.slice(0, -1);
      } else {
        liveRow += ch;
        let e = history[history.length - 1];
        if (e && e.open) e.content += ch;
      }
    }
    term.write(c);
  }

  // ── request stream (DASH) ──────────────────────────────────────────────────
  let history = $state<Entry[]>([]);
  let sending = $state(false);
  let step = $state<'idle' | 'posting' | 'receiving'>('idle');
  let ready = $state(false);
  let dashController: AbortController | null = null;
  // The session-correlation tag handed out on the SSE handshake ({t:'sseinit',
  // tag}). Every POST /dash echoes it (header X-Dash-Session) so the server
  // resolves the separate POST connection back onto the session that owns the
  // stream. The frame order at attach: sseinit → ready → banner* (8+ frames)
  // → boot*6 (live rows) → stats/flow/vram continuous tail.
  let connTag = $state('');
  let streamReady = $state(false);

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
    else if (typeof p.ttft_p90 === 'number') huds.ttft = p.ttft_p90 as number;
    if (typeof p.tokensPerSec === 'number') huds.tspk = p.tokensPerSec;
    else if (typeof p.tkr_p90 === 'number') huds.tspk = p.tkr_p90 as number;
    if (typeof p.completions === 'number') huds.comp = p.completions;
    const fl = p.flow as number[] | undefined;
    if (Array.isArray(fl) && fl.length) huds.flow = fl.slice(-FLOW_MAX);
  }
  function updateVram(v: number | null, label?: string) {
    huds.vram = v;
    if (label) huds.vramSrc = label;
  }

  // ── the char band: the ENTIRE visible path is term.write(f.c) ONLY ───────
  function focusInput() {
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      }
    }, 0);
  }

  // ── frame dispatch ──────────────────────────────────────────────────────────
  type DashFrame = { t: string; [key: string]: unknown };
  let dashStreamSeenFrame = false;

  function handleFrame(f: DashFrame): void {
    switch (f.t) {
      case 'sseinit': {
        // PRE-ATTACH CLEAR (operator's reconnect fix — hybrid screen state
        // on late attach: a stale partial row + a dot field pointing at a
        // stale row index). Fire BEFORE any chars can land so the very first
        // title character lands on a clean full-screen.
        if (term) term.write('\x1b[2J\x1b[H');
        if (typeof f.tag === 'string') connTag = f.tag;
        break;
      }
      case 'ready': {
        ready = true;
        streamReady = true;
        dashAttached = true;
        break;
      }
      case 'chars': {
        if (typeof f.c === 'string') onChars(f.c);
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
        // Control/error frame: no visible band change is requested by them
        // (the server's typed '  ERR …' line already told the story). The HUD
        // lamp (step) + the open entry's error field carry the state.
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
      lineHeight: LINE_HEIGHT,
      letterSpacing: LETTER_SPACING,
      // Natural flow — xterm behaves normal: append-at-current + its own
      // follow-near-tail default is the ONLY follow logic (no tail math, no
      // pad seeding, no bottom-hug, no clamp). The prompt tail row lands
      // directly BELOW the READY. row when the banner settles (on the
      // {t:'banner',ready:true} frame), and the composer rides it (commit
      // prompt on the first keypress, Enter commits to transcript).
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
      // The banner rows stream in from the server (order: title → header →
      // 6 module rows → footer → triad → blank → READY. → tail). We do NOT
      // prime anything here; the stream draws the whole shape. Once the
      // tail frame ({t:'banner',ready:true}) lands, we append the prompt
      // row (single '\n' + '❯ ') directly below the READY. row.
      dashAttached = true;
      booted = true;
      void openDashStream();
    })();

    const ro = new ResizeObserver(() => {
      if (fit && term) {
        fit.fit();
        // The char band owns cursor position (the server types; the client
        // term.writes) — NOTHING is re-rendered on resize (no CUP behind).
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
    // The char band owns cursor position (the server types; the client
    // term.writes) — the input's own DOM state is the only live feedback.
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
    if (text.length === 0 || sending) return;
    // COMMIT the user send line to the transcript (the server's '« …' echo
    // on the char band is the visible print — the client does not pre-echo).
    if (inputEl) inputEl.value = '';
    sending = true;
    step = 'posting';
    history.push({
      user: text, reasoningChars: 0, content: '', open: true,
      reqId: null, error: null,
    });
    // The committed user line is scrolled to the tail; the composer is that
    // tail row now. NO explicit scroll (the char band owns cursor position).
    typedText = '';

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
        // POST receipt failure: no band change requested — the server may
        // have typed '  ERR …' already; nothing more to print here.
        void body; void res.status;
      }
      step = 'idle';
    } catch (err) {
      const aborted = (err as { name?: string } | null | undefined)?.name === 'AbortError';
      const e = history[history.length - 1];
      if (e && !aborted) e.error = (err as { message?: string } | null | undefined)?.message ?? String(err);
      // fetch-failure: no band change requested — the HUD lamp (step) plus
      // the open entry's error field carry it.
      step = 'idle';
    } finally {
      sending = false;
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
      ROM {ROM_KIB} · xterm {XTERM_VERSION}
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
    gap: 8px;
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
