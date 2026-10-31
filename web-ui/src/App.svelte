<script lang="ts">
  // CARL-01 v0.2.0 — wire protocol V1 (envelope from/to, kd dirty-only,
  // tx from/to/kind). Form-C renderer (the 5 rules) is UNCHANGED — only the
  // wire source changed: the R2 frame machine (t:sseinit/ready/open/re/close,
  // F/n/m) and the R3 fold/seq reader are DEAD.
  //
  // SHAPE EXACT (Form C, spec-of-record 2026-10-30):
  //   .screen  (100vw x 100vh, overflow hidden, flex column, bg #00040b)
  //   ▸ .history — ONE read-only <pre> (white-space:pre; flex 1 1 auto;
  //     min-height 0; overflow-y auto) = the ONLY scroller. Its ONE text
  //     node is the whole console: every line is a 2-char IN-STREAM GUTTER
  //     (col 0 = state/classifier, col 1 = decorator) + content — byte-
  //     exact. NO per-row div, NO per-line span, NO 8px grid. In-place
  //     re-issue (dot fill / settle) rewrites the line's substring IN THE
  //     ONE text node, keyed by the ROW TABLE (row-id → line index).
  //   ▸ .livecell — exactly ONE absolutely-positioned node, one gutter
  //     column wide, at column 0 of the active row. CSS @keyframes 8-
  //     braille steps(8) 640ms spinner while crtx mode == 'active'; dies
  //     on the service flip. NO JS timer.
  //   ▸ .input  — the ONE writable node below the pre (one <textarea>,
  //     native block caret, maxlength 500, spellcheck false).
  //
  // WIRE V1:
  //   ENTRY  t=kd from=carl to=oper-<id> data={path:value}+hp={handle:path}
  //     → read oper-id from 'to', fold data, build the handle decoder from
  //       hp, paint the banner. Then SILENCE (no frames until a change).
  //   WAVE   t=kd from=<faculty> tick/seq_end dirty={handle:value}
  //     → decode handle via hp, apply to the local tree, re-render the
  //       affected row(s). dirty-only (a settled handle is never re-sent).
  //   tx usr → (operator side: freeze + clear + POST)
  //   tx ans → seq 1..N within the reply (a seq reset or a crtx active flip
  //     opens a new reply); drop the chunk bytes in order.
  //   kd crtx mode active → live cell spins on the crtx row (col 0).
  //   kd crtx mode service → live cell dies, focus returns to the input.
  //   kd immu selftest progress → dotField(progress) = round(p/100*12) dots.
  //   kd immu selftest pass → 12 dots + 'OK @ X.Xms'; fault → 12 dots + 'FAULT'.
  //
  // G2: scroll-to-bottom only when at-bottom (within one line pitch), same
  // rAF as the append.  G4: font-display block (carl.css).  G1: post-font-
  // load width assert (2-gutter == live-cell*2 == 2x content char).  F5:
  // dim #682A00 NEVER painted (the gutter paints #0981b4).

  import { onMount, onDestroy } from 'svelte';
  import './carl.css';

  const D = '\u00B7';   // the 12-dot self-test field byte (in-stream content)
  const LH = 20;        // line pitch, px — the locked --fh value (G2 + live cell y)
  const HEAD_L = 'CARL \u00B7 PROVISIONING TERMINAL';
  const RUNG_LABEL = ['DASH', 'IMMU', 'CRTX', 'TELE', 'NERV', 'LLM1'];
  // target order (tree keys are under the DRIVER, carl.immu.selftest.<short>):
  const RKEY = ['dash', 'immu', 'crtx', 'teleg', 'nerv', 'llm1'];
  const FIELD_WDTS = 12; // the 12-dot field (dotField(p) = round(p/100*12), 12 at 100)
  const ROWS = 14;       // the fixed console: title, 8 box rows, separator,
                        // blank, ROM, blank, READY (row-ids boot:0..boot:13).

  let draft = '';
  let sid = '';            // OPER-<random> — read from the entry frame's 'to'
  let text = '';           // the ONE text node content
  let preEl: HTMLPreElement | null = null;
  let inputEl: HTMLTextAreaElement | null = null;
  let livecellEl: HTMLDivElement | null = null;
  let arming = false;
  let booted = false;
  let crtxActive = false;  // crtx mode == 'active' (the live cell's window)

  // the client fold of the server tree (entry data + kd waves; never overwrite)
  const tree = new Map<string, string | number | boolean | object | null>();
  const rowTable = new Map<string, number>();     // row-id → line index
  const handleToPath = new Map<string, string>(); // hp: handle → dotted path
  const live = { row: -1 };

  // --- the wire V1: entry + waves (kd) / conversation (tx) ----------------------

  function onEvent(e: MessageEvent): void {
    let f: Record<string, unknown>;
    try { f = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
    if (f.t !== 'kd' && f.t !== 'tx') return;
    if (f.t === 'kd') onKd(f); else onTx(f);
  }

  function onKd(f: Record<string, unknown>): void {
    const to = typeof f.to === 'string' ? f.to : '';
    if (to && !to.startsWith('oper-')) return; // not this session (broadcasts route per id)
    const data = f.data as { [p: string]: string | number | boolean | object | null } | undefined;
    const dirty = f.dirty as { [h: string]: string | number | boolean | object | null } | undefined;
    if (data !== undefined && f.from === 'carl') {
      // ENTRY (also the V1 reconnect re-snapshot): full tree + fresh hp,
      // the oper-id in 'to'. Re-arm cold on every entry (reconnect = re-render)
      sid = to;
      for (const p of Object.keys(data)) tree.set(p, data[p]);
      const hp = f.hp as { [k: string]: string } | undefined;
      if (hp) { handleToPath.clear(); for (const k of Object.keys(hp)) handleToPath.set(k, hp[k]); }
      booted = false;
      paintAll();
      return;
    }
    if (dirty !== undefined) {
      // WAVE: decode handles via hp, apply to the tree (latest value), re-render
      for (const h of Object.keys(dirty)) {
        const p = handleToPath.get(h);
        if (p !== undefined) tree.set(p, dirty[h]);
      }
      paintAll();
    }
  }

  // the crtx mode flip: active = spin up the live cell on the crtx row + open
  // the reply row; service = the cell dies and focus returns to the input.
  let replyOpen = false;
  let replyLine = -1;
  let seq = 0;

  function crtxMode(): unknown {
    const v = tree.get('carl.faculties.crtx');
    return (typeof v === 'object' && v !== null) ? (v as { mode?: unknown }).mode : null;
  }

  function onTx(f: Record<string, unknown>): void {
    const kind = String(f.kind ?? '');
    const to = String(f.to ?? '');
    if (to && sid && to !== sid) return; // crtx chat routes to the specific session that asked
    if (kind === 'ans') {
      const n = Number(f.seq ?? 0);
      const c = typeof f.text === 'string' ? f.text : '';
      if (!c) return;
      if (!replyOpen || n < seq) {
        // a NEW reply: the crtx active flip (or a seq reset) is the opener
        if (!replyOpen) {
          replyLine = lineCount();
          replyOpen = true;
          seq = 1;
          setLine('reply', replyLine, '');
        }
        if (n < seq) seq = 1; // the seq reset within a new reply
      }
      seq = Math.max(seq, n);
      appendReplyChunk(c);
      scheduleScroll(true);
    }
  }

  function appendReplyChunk(c: string): void {
    const lines = text.split('\n');
    const cur = lines[replyLine] || '\u00BB ';
    lines[replyLine] = cur.slice(0, 2) + cur.slice(2) + c; // dump IN ORDER
    text = lines.join('\n');
  }

  function settleReplyRow(): void {
    // the close-equivalent re-issue: once crtx is back to service and the
    // reply row holds its text, re-issue the line's 2-char gutter (» ) IN
    // THE ONE text node, keyed by the row table (element identity survives)
    const lines = text.split('\n');
    if (replyLine < 0 || replyLine >= lines.length) return;
    const cur = lines[replyLine];
    if (cur.slice(0, 2) === '\u00BB ' && cur.slice(2).length > 0) {
      lines[replyLine] = '\u00BB ' + cur.slice(2);
      text = lines.join('\n');
    }
  }

  // --- the banner (client-rendered from the entry tree + waves) -------------------

  function paintAll(): void {
    if (!booted && tree.has('carl.version')) { booted = true; }
    for (let i = 0; i < ROWS; i++) setLine('boot:' + i, i, bodyOf(i));
    if (crtxMode() === 'active' && !replyOpen && tree.get('carl.faculties.crtx')) {
      // the crtx active flip: open the reply row (the live cell spins col 0)
      if (!replyOpen) {
        replyLine = lineCount();
        replyOpen = true;
        seq = 1;
        setLine('reply', replyLine, '');
      }
    }
    crtxActive = crtxMode() === 'active';
    if (!crtxActive && replyOpen) { settleReplyRow(); replyOpen = false; arming = true; }
    placeLiveCell();
    scheduleScroll();
  }

  function bodyOf(i: number): string {
    const ver = String(tree.get('carl.version') ?? '');
    switch (i) {
      case 0: return HEAD_L + ' ' + ver;
      case 1: return '';
      case 2: return '- SELF-TEST ----------------------';
      case 3: return rungBody(0);
      case 4: return rungBody(1);
      case 5: return rungBody(2);
      case 6: return rungBody(3);
      case 7: return rungBody(4);
      case 8: return rungBody(5);
      case 9: return '----------------------------------';
      case 10: return '';
      case 11: {
        const rom = tree.get('carl.rom');
        const mem = tree.get('carl.mem');
        const r = (rom === null || rom === undefined) ? 'ROM --k' : 'ROM ' + rom + 'k';
        const m = (mem === null || mem === undefined) ? 'MEM --.-MB' : 'MEM ' + Number(mem).toFixed(1) + 'MB';
        return r + ' \u00B7 ' + m;
      }
      case 12: return '';
      case 13: return 'READY.';
      default: return '   ';
    }
  }

  // dotField(progress) — 0..100% → 0..12 in-stream `·`, fixed 12-wide gap
  function dotField(progress: number): string {
    const n = Math.min(FIELD_WDTS, Math.max(0, Math.round((Math.min(100, progress) / 100) * FIELD_WDTS)));
    return D.repeat(n) + ' '.repeat(FIELD_WDTS - n);
  }

  // the selftest keys are under the DRIVER (V1 key shape): carl.immu.selftest.<short>.
  function rungBody(i: number): string {
    const sector = 'carl.immu.selftest.' + RKEY[i];
    const mode = tree.get(sector + '.mode');
    const prog = Number(tree.get(sector + '.progress') ?? 0);
    const ms = tree.get(sector + '.ms');
    if (mode === 'pass' && ms !== null && ms !== undefined) {
      return '> ' + RUNG_LABEL[i] + ' ' + dotField(100) + ' ' + 'OK @ ' + Number(ms).toFixed(1) + 'ms';
    } else if (mode === 'fault' || mode === 'fail') {
      return '> ' + RUNG_LABEL[i] + ' ' + dotField(100) + ' ' + 'FAULT';
    } else if (mode === 'active') {
      return '> ' + RUNG_LABEL[i] + ' ' + dotField(prog);
    } else {
      return '> ' + RUNG_LABEL[i] + ' ' + dotField(0);
    }
  }

  // --- the ONE text node: append + in-place re-issue (row-table keyed) -------------

  function setLine(id: string, lineIdx: number, content: string): void {
    const lines = text.split('\n');
    while (lines.length <= lineIdx) lines.push('  ');
    const g = gutterFor(id, lineIdx);
    lines[lineIdx] = g + content;
    text = lines.join('\n');
    rowTable.set(id, lineIdx);
  }

  function gutterFor(id: string, lineIdx: number): string {
    if (id.startsWith('boot:')) {
      const d = lineIdx === 0 ? '\u250C' : lineIdx === ROWS - 1 ? '\u2514' : '\u2502';
      return ' ' + d;      // col0 blank + col1 the frame bar
    }
    if (id.startsWith('usr:')) return '\u00AB ';  // col0 = the user classifier
    if (id === 'reply') return '\u00BB ';         // col0 = the reply classifier
    return '  ';
  }

  function lineCount(): number {
    return text === '' ? 0 : text.split('\n').length;
  }

  // --- the live cell (ONE node; the CSS spinner; NO JS timer) ------------------------

  function placeLiveCell(): void {
    const lc = livecellEl;
    if (!lc) return;
    // the live cell rides col 0 of the crtx row (row index 5) while crtx is
    // active (a turn's THRU window); it dies on the service flip.
    const row = (crtxMode() === 'active') ? 5 : -1;
    live.row = row;
    lc.classList.toggle('spin', row >= 0);
    if (row < 0) { lc.style.display = 'none'; return; }
    lc.style.display = 'block';
    lc.style.top = (row * LH) + 'px';
  }

  // --- G2: the at-bottom guard (same rAF as any append) --------------------------------

  let raf = 0;
  function scheduleScroll(force = false): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = preEl;
      if (el) {
        const dist = el.scrollHeight - (el.scrollTop + el.clientHeight);
        if (force || dist < LH) el.scrollTop = el.scrollHeight; // one-line pitch
      }
      if (arming) { arming = false; inputEl?.focus(); }
      if (!g1Done) void gate();
    });
  }

  let g1Done = false;

  // --- Enter-freeze (preventDefault; echo on freeze; not live) -------------------------------

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing && !e.shiftKey) {
      e.preventDefault();
      const msg = draft;
      if (msg.length > 0 && sid) {
        setLine('usr:' + (lineCount()), lineCount(), msg); // freeze as a read-only row
        sendTx('crtx', 'usr', { text: msg });               // the wire: a tx usr frame
      }
      draft = ''; // clear; the native caret stays in the textarea
    }
  }

  // the tx usr POST (the op/echo path): from = oper-id, to = the faculty
  function sendTx(to: string, kind: string, data: { [k: string]: unknown } = {}): void {
    void fetch('/sse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t: 'tx', from: sid, to, kind, data }),
    }).catch(() => { /* wire down: the reply just doesn't come (mock brain) */ });
  }

  // --- the wire connect: no id; the server mints oper-<id> (entry 'to') ---------------

  let es: EventSource | null = null;
  function connect(): void {
    const e = new EventSource('/sse'); // no id, no tag — the 't' field IS the type
    es = e;
    e.onmessage = onEvent;
  }

  // --- G1: the byte-exact width gate (post-font-load; no swap on fail) -------------------

  async function gate(): Promise<void> {
    try { document.fonts?.load?.('16px Glass'); await document.fonts?.ready; } catch { /* measure as-is */ }
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d')!;
    ctx.font = '16px Glass, monospace';
    const g2 = ctx.measureText('\u00A0\u2502').width;  // a 2-char gutter span
    const lc = ctx.measureText('\u2801').width;        // the live-cell glyph (col0)
    const x1 = ctx.measureText('x').width;             // one content char
    const ok = Math.abs(g2 - 2 * x1) <= 0.75 && Math.abs(lc - x1) <= 0.75;
    g1Done = true;
    if (ok) console.info('G1 OK: gutter(2) == 2x content char; live-cell == 1 char (half-grid face)');
    else console.error('G1 FAIL: gutter(2)=' + g2 + ' live-cell=' + lc + ' x2-content=' + 2 * x1 + ' — DO NOT SHIP (no font swap)');
  }

  onMount(() => { connect(); window.addEventListener('keydown', onKey, true); });
  onDestroy(() => { es?.close(); });
</script>

<div class="screen">
  <div class="history">
    <pre class="tapes" bind:this={preEl}>{text || ' '}</pre>
    <div class="livecell" bind:this={livecellEl}></div>
  </div>
  <textarea
    class="input"
    bind:this={inputEl}
    bind:value={draft}
    spellcheck="false"
    autocomplete="off"
    maxlength="500"
    rows="1"
    aria-label="input">
  </textarea>
</div>
