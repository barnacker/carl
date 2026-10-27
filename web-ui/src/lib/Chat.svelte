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
  // One SSE stream carries: boot banner rows (the DASH faculty streams the
  // whole banner — title, stats footer, triad, READY — as verbatim 'banner'
  // frames + per-module row frames with server-paced dot frames), user/
  // thinking/reasoning/content/done frames, continuous stats + flow, and the
  // 1Hz vram cell. The SPA is a FAITHFUL RENDERER of the stream: it appends
  // what the server sends, verbatim — the client has no banner template, no
  // client-side dot timer, no client-side ROM/MEM calculation. xterm.js is
  // the transcript + the stream-rendered boot surface in ONE surface.
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
    reasoningChars: number; // COUNT ONLY — raw reasoning stays dark
    content: string;
    open: boolean;
    thinking: boolean;
    firstByte: boolean;
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
  // server's {t:'user'} frame text is what we paint — this is just how the
  // CLIENT renders the user's own send before the echo arrives).
  const USER_MARKER = '\u00AB';
  const ASSISTANT_MARKER = '\u00BB';
  const PROMPT_PREFIX = '❯';

  // ── COMPOSER (the type-drift fix) ──────────────────────────────────────────
  // THE PROMPT ROW is at a FIXED ABSOLUTE buffer Y (the row where the banner
  // settled). Every render addresses it with CUP (col 1) so it never drifts:
  // per-keystroke drift happened because the old code wrote at the CURRENT
  // cursor column (which advances with each write) instead of rewinding.
  //
  // The banner settles when the {t:'banner', ready:true} frame lands (after
  // the READY. row); on that frame we commit the prompt row to the buffer
  // (one newline to end the READY. line, then '❯ ' + typedText) and render.
  // The composer is FREE-FLOW (the row stays where the banner ended) — no
  // minimum-rows calc, no seedPad, no absolute position, no bottom-hug.
  let typedText = $state('');
  // 0-based buffer row the prompt is currently anchored on.
  let promptRowAbs = -1;
  function renderComposer(): void {
    if (!term || promptRowAbs < 0) return;
    const buf = term.buffer.active;
    const rel = promptRowAbs - buf.baseY + 1;
    if (rel < 1 || rel > term.rows) return;
    const text = PROMPT_PREFIX + ' ' + typedText;
    term.write('\x1b[' + rel + ';1H' + CLEAR_LINE + text);
  }
  function commitPromptRow(): void {
    // Called exactly once per banner settle (t:'banner' ready:true). The
    // banner's last row (READY.) left the cursor at col 1 of the row right
    // after it; we paint the prompt tail in-place at the cursor (prompts
    // land DIRECTLY BELOW the READY. row — the operator lock). We record the
    // 0-based buffer row so subsequent keystrokes / Enter commits render to
    // the same absolute row (no drift).
    if (!term) return;
    const buf = term.buffer.active;
    const abs = (buf.viewportY - buf.baseY) + buf.baseY - 1; // 0-based cursor
    promptRowAbs = abs;
    term.write(CLEAR_LINE + PROMPT_PREFIX + ' ');
  }
  function renderCurrentComposer(): void {
    renderComposer();
  }

  // ── BANNER (the stream is the transcript; the server OWNS the text) ───────
  // The client holds per-module state ONLY for (a) CSS class / spin target
  // if the round goes fault, and (b) the one in-place repaint the dot frame
  // needs (CUP to that row, col 1, the row text). We do NOT paint a box, no
  // client-side dot timer, no client-side ROM/MEM compute.
  // The 6 module rows are the "row slots" for the in-place repaint — the
  // server streams them in DASH_BOOT_MODULES order, but the DISPLAY ORDER is
  // DASH-first (the client's row-index map). The row-slot lookup is a fixed
  // name→row map (no re-ordering of the wire).
  type ModuleState = 'pending' | 'testing' | 'ok' | 'fault' | 'retry';
  const MODULES: readonly string[] = ['DASH', 'TELE', 'NERV', 'IMMU', 'CRTX', 'LLM1'];
  let modState = $state<Record<string, ModuleState>>({});
  const modRowAbs: Record<string, number> = {}; // module → 0-based buffer row
  let bannerSettled = false;
  let promptCommitted = false;
  function bannerAppendRow(text: string): void {
    if (!term) return;
    term.write(text + '\r\n');
  }
  function paintModuleRow(name: string, text: string): void {
    const abs = modRowAbs[name];
    if (abs === undefined || !term) return;
    const buf = term.buffer.active;
    const rel = abs - buf.baseY + 1;
    if (rel < 1 || rel > term.rows) return;
    term.write('\x1b[' + rel + ';1H' + CLEAR_LINE + text);
  }
  // Map a wire module name to the canonical key used in our row-slot map.
  // 'LLM1' is the project module name the server tags the row with; the
  // display label is also 'LLM1' (the rename is owned by the server's
  // DASH_BOOT_DISPLAY map, not the client). 'LLM' maps to 'LLM1' too in
  // case any legacy frames (or a mid-rollout server) still carry the old.
  const MODULE_KEY = (m: string): string => (m === 'LLM' ? 'LLM1' : m);

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
  // stream. The frame order at attach: sseinit → ready → banner* (8+ frames)
  // → boot*6 (live rows) → stats/flow/vram continuous tail.
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

  // ── print primitives ───────────────────────────────────────────────────────
  function printUserLine(text: string): void {
    if (!term) return;
    // One marker + ONE space — the raw guillemet (U+00AB) rides the
    // fallback chain (JetBrains/DepartureMono both have it).
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

  // ── frame dispatch ──────────────────────────────────────────────────────────
  type DashFrame = { t: string; [key: string]: unknown };
  let dashStreamSeenFrame = false;

  function handleFrame(f: DashFrame): void {
    switch (f.t) {
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
      case 'banner': {
        // DASH-faculty banner frame kind (the server OWNS the banner text):
        //   {t:'banner', row: string}            — one verbatim row, appended
        //   {t:'banner', row: string, m: string} — a module-seeded row (the
        //                                          6 module rows, in DASH-first
        //                                          order). We record each row's
        //                                          0-based buffer row BEFORE
        //                                          writing (so the live dot/
        //                                          settle frames CUP back to
        //                                          the exact same row in-place,
        //                                          without re-appending).
        //   {t:'banner', ready: true}            — the banner is settled;
        //                                          commit the prompt tail
        // The client renders the row verbatim (xterm.write). No client
        // template, no client dot timer, no client ROM/MEM compute.
        if (f.ready === true) {
          if (!bannerSettled) {
            bannerSettled = true;
            if (!promptCommitted) {
              promptCommitted = true;
              commitPromptRow();
              focusInput();
            }
          }
        }
        if (typeof f.row === 'string') {
          if (f.partial === true) {
            // Character-stream partial (title/header/tail rows): repaint the
            // current cursor row IN-PLACE with the growing text (CUP +
            // CLEAR_LINE). Never appended — the row is fixed at the cursor
            // row for the stream's duration (no re-append, no drift).
            if (term) {
              const buf = term.buffer.active;
              const rel = buf.viewportY - buf.baseY + 1;
              if (rel >= 1 && rel <= term.rows) {
                term.write('\x1b[' + rel + ';1H' + CLEAR_LINE + f.row);
              }
            }
          } else {
            // Full row (partial:false or a legacy/seed frame): append once;
            // the m-tagged seed rows record their absolute row for the
            // CUP-repaint map (dot/settle frames address them later).
            const absBefore = term ? (term.buffer.active.viewportY - term.buffer.active.baseY) : -1;
            bannerAppendRow(f.row);
            if (typeof f.m === 'string' && absBefore >= 0) {
              const key = MODULE_KEY(f.m);
              modState[key] = modState[key] ?? 'pending';
              modRowAbs[key] = absBefore; // 0-based — the row we just appended
            }
          }
        }
        break;
      }
      case 'boot': {
        // The boot frame's `m` is the project module name; the module-seed
        // banner frame (t:'banner', row, m) pre-seeds the 6 rows in DASH-first
        // display order and records each row's absolute buffer row. This case
        // handles the LIVE phases (testing/dot/ping/pending retry) with a
        // single in-place repaint per module row (the server sends the row
        // text — the client does NOT pretend a timer, it just paints what the
        // stream tells it). The settle frame (s in ok|fault) is the final
        // paint; the row is then PERMANENT (never re-cursor'd except via a
        // retry which re-animates its own row with fresh dots).
        const m = typeof f.m === 'string' ? MODULE_KEY(f.m) : '';
        const s = f.s as 'testing' | 'dot' | 'ok' | 'fault' | 'pending' | 'ping' | 'retry' | undefined;
        if (!m) break;
        modState[m] = modState[m] ?? 'pending';
        const row = typeof f.row === 'string' ? (f.row as string) : null;
        if (row) {
          if (s === 'dot' || s === 'testing' || s === 'ping' || s === 'pending' || s === 'retry') {
            // Live frame: CUP back to the row's recorded absolute buffer row,
            // paint the row's text verbatim. The dots grow server-paced (the
            // frame is the ONLY update source — no client dot timer).
            paintModuleRow(m, row);
            if (s === 'pending') modState[m] = 'pending';
            else if (s === 'ping') modState[m] = 'testing';
            else modState[m] = 'testing';
          } else if (s === 'ok' || s === 'fault') {
            // Settle: CUP back to the row, paint the final text (dots padded
            // to 12 by the server + status + ' * NNms' or ' — detail').
            paintModuleRow(m, row);
            modState[m] = s;
          }
        }
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
