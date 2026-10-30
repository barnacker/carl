<script lang="ts">
  // CARL-01 v0.1.3 — Form C (spec-of-record 2026-10-30, gate §5/§8).
  //
  // Shape EXACT:
  //   .screen  (100vw x 100vh, overflow hidden, flex column, bg #00040b)
  //   ▸ .history — ONE read-only <pre> (white-space:pre; flex 1 1 auto;
  //     min-height 0; overflow-y auto) = the ONLY scroller. Its ONE text
  //     node is the whole console: every line is a 2-char IN-STREAM GUTTER
  //     (col 0 = state/classifier, col 1 = decorator) + content — byte-
  //     exact (spaces + LF respected). NO per-row div, NO per-line span, NO
  //     8px grid. In-place re-issue (dot fill / settle / drip) rewrites the
  //     line's substring IN THE ONE text node, keyed by the ROW TABLE
  //     (row-id → line index); element identity = the table entry + the
  //     live cell re-anchored.
  //   ▸ .livecell — exactly ONE absolutely-positioned node, one gutter
  //     column wide, at column 0 of the active row (left 0, top row*LH).
  //     Carries the CSS @keyframes 8-braille steps(8) 640ms spinner WHILE
  //     any selftest .mode=='active' (a boot rung or a turn's THRU window);
  //     dies on pass OR first reply char. NO JS timer.
  //   ▸ .input  — the ONE writable node below the pre: one <textarea>
  //     (variable height capped ~40vh + own overflow-y auto, native block
  //     caret, maxlength 500, spellcheck false, autocomplete off).
  //
  // STATE TREE is the wire: the snapshot {t:'kd',snap:{path:value}} is the
  // full folded tree (the row-map source); waves {t:'kd',tick,seq_end,
  // dirty:{handle:value}} on the 60Hz clock, coalesced per key (hot
  // selftest.progress rides every wave; a no-op wave — empty dirty — still
  // advances seq: phase lock). tx chunks {t:'tx',seq,tag,c} = CONVERSATION
  // ONLY: zero c during boot; the banner RENDERS from carl.version + the
  // selftest progress/mode/ms (12 dots per rung from progress, 'OK @ X.X
  // ms' from {pass, ms}; the client formats, the server sends values).
  //
  // Two-writer: the tree render writes the banner lines; the c caption
  // dumps into the same ONE text node in order. Enter (not shift+enter)
  // freezes the draft into a usr row (col 0 = left guillemet), clears, and
  // POSTs (echo-on-freeze, not live); on reply close-equivalent the tail
  // re-arms + focus() in the SAME rAF as scroll-to-bottom.
  //
  // G2: scroll-to-bottom only when at-bottom (within one line pitch), same
  // rAF as the append; overflow-anchor is NEVER none.  G4: font-display
  // block (carl.css).  G1: post-font-load, measure a 2-char gutter span,
  // the live-cell glyph and one content char in the loaded face; assert
  // 2-gutter == live-cell*2 == 2x content char (half-grid face); fail =
  // console.error + NO ship (no font swap — operator-locked face).  F5:
  // dim #682A00 NEVER painted (the gutter paints #0981b4).

  import { onMount } from 'svelte';
  import './carl.css';

  const D = '\u00B7';   // the 12-dot self-test field byte (in-stream content)
  const LH = 20;        // line pitch, px — the locked --fh value (G2 + live cell y)
  const HEAD_L = 'CARL \u00B7 PROVISIONING TERMINAL';
  const RUNG_LABEL = ['DASH', 'IMMU', 'CRTX', 'TELE', 'NERV', 'LLM1'];
  const RKEY = ['dash', 'immu', 'crtx', 'teleg', 'nerv', 'llm1'];
  const DOTS = 12;      // run-g: the dot field rendered from progress

  let draft = '';
  let sid = '';
  let text = '';                                  // the ONE text node content
  let preEl: HTMLPreElement | null = null;
  let inputEl: HTMLTextAreaElement | null = null;
  let livecellEl: HTMLDivElement | null = null;
  let arming = false;
  let booted = false;
  let turning = false;     // a turn's ANS row is open (drip in flight)
  let turnLine = -1;
  let usrSeq = 0;

  // the server tree (client fold: snapshot + kd waves; values never overwrite)
  const tree = new Map<string, string | number | null>();
  const rowTable = new Map<string, number>();     // row-id → line index (table)
  const live = { row: -1, kind: '' as '' | 'boot' | 'turn' };

  // --- the wave in (kd = tree truth; tx = the ONLY channel) --------------------------

  let lastSeq = 0;
  function onEvent(e: MessageEvent): void {
    let f: Record<string, unknown>;
    try { f = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
    if (f.t === 'kd') {
      const seq = Number(f.seq_end ?? 0);
      if (seq <= lastSeq) return; // never-overwrite
      lastSeq = seq;
      const snap = f.snap as { [p: string]: string | number | null } | undefined;
      const dirty = f.dirty as { [k: string]: string | number | null } | undefined;
      if (snap) {
        for (const p of Object.keys(snap)) tree.set(p, snap[p]);
        const hp = f.hp as { [k: string]: string } | undefined;
        if (hp) foldHandleTable(hp); // the handle→path table (waves map by handle)
      } else if (dirty) {
        for (const k of Object.keys(dirty)) {
          const p = handleToPath.get(k);
          if (p !== undefined) tree.set(p, dirty[k]);
        }
      }
      afterWave();
      return;
    }
    if (f.t === 'tx') onChunk(f);
  }

  // handle→path (the snapshot's hp field; stable — a changed handle = protocol break)
  const handleToPath = new Map<string, string>();
  function foldHandleTable(hp: { [k: string]: string }): void {
    handleToPath.clear();
    for (const k of Object.keys(hp)) handleToPath.set(k, hp[k]);
  }

  function afterWave(): void {
    if (!booted && tree.has('carl.version')) {
      booted = true;
      writeBanner();
    }
    if (booted) paintBanner();
    if (turnLine >= 0) settleReplyRow();
    placeLiveCell();
    scheduleScroll();
  }

  // --- the banner (client-rendered; zero c during boot) --------------------------------

  function writeBanner(): void {
    for (let i = 0; i < 12; i++) setLine('boot:' + i, i, bodyOf(i));
  }

  function paintBanner(): void {
    for (let i = 0; i < 12; i++) setLine('boot:' + i, i, bodyOf(i));
  }

  function bodyOf(i: number): string {
    const ver = String(tree.get('carl.version') ?? '');
    switch (i) {
      case 0: return HEAD_L + ' ' + ver;
      case 1: return '  ';
      case 2: return '- SELF-TEST ----------------------';
      case 3: return rungBody(0);
      case 4: return rungBody(1);
      case 5: return rungBody(2);
      case 6: return rungBody(3);
      case 7: return rungBody(4);
      case 8: return rungBody(5);
      case 9: return '----------------------------------\r\n';
      case 10: {
        const rom = tree.get('carl.rom');
        const mem = tree.get('carl.mem');
        const r = (rom === null || rom === undefined) ? 'ROM --k' : 'ROM ' + rom + 'k';
        const m = (mem === null || mem === undefined) ? 'MEM --.-MB' : 'MEM ' + Number(mem).toFixed(1) + 'MB';
        return r + ' \u00B7 ' + m + '\r\n';
      }
      case 11: return 'READY.';
      default: return '   ';
    }
  }

  function rungBody(i: number): string {
    const sector = 'carl.carl.selftest.' + RKEY[i];
    const mode = tree.get(sector + '.mode');
    const prog = Number(tree.get(sector + '.progress') ?? 0);
    const ms = tree.get(sector + '.ms');
    let field: string;
    if (mode === 'active') {
      const dots = Math.min(DOTS, Math.max(0, Math.round((Math.min(100, prog) / 100) * DOTS)));
      field = D.repeat(dots) + ' '.repeat(DOTS - dots);
    } else if (mode === 'pass' && ms !== null && ms !== undefined) {
      field = 'OK @ ' + Number(ms).toFixed(1) + 'ms';
    } else if (mode === 'fail') {
      field = 'FAULT';
    } else {
      field = ' '.repeat(DOTS);
    }
    return '> ' + RUNG_LABEL[i] + '  ' + field;
  }

  // --- the ONE text node: append + in-place re-issue (row-table keyed) ----------------

  function setLine(id: string, lineIdx: number, content: string): void {
    const lines = text.split('\n');
    while (lines.length <= lineIdx) lines.push('  ');
    const g = gutterFor(id, lineIdx);            // the 2-char IN-STREAM gutter
    lines[lineIdx] = g + content;
    text = lines.join('\n');
    rowTable.set(id, lineIdx);
  }

  function gutterFor(id: string, lineIdx: number): string {
    // R1/R2: col0 = state (space — the live cell overlays col0 of the active
    // row), col1 = decorator (the boot box; blank elsewhere)
    if (id.startsWith('boot:')) {
      const d = lineIdx === 0 ? '\u250C' : lineIdx === 11 ? '\u2514' : '\u2502';
      return ' ' + d;   // col0 blank + col1 the frame bar
    }
    if (id.startsWith('usr:')) return '\u00AB ';  // col0 = the user classifier
    if (id === 'reply') return '\u00BB ';         // col0 = the reply classifier
    return '  ';
  }

  function lineCount(): number {
    return text === '' ? 0 : text.split('\n').length;
  }

  // --- the live cell (ONE node; the CSS spinner; NO JS timer) ---------------------------

  function placeLiveCell(): void {
    const lc = livecellEl;
    if (!lc) return;
    let row = -1;
    for (let i = 0; i < 6; i++) {
      if (tree.get('carl.carl.selftest.' + RKEY[i] + '.mode') === 'active') { row = 3 + i; break; }
    }
    if (row < 0 && turning) row = turnLine;   // the turn's THRU row (until first char)
    live.row = row;
    lc.classList.toggle('spin', row >= 0);
    if (row < 0) { lc.style.display = 'none'; return; }
    lc.style.display = 'block';
    lc.style.top = (row * LH) + 'px';
  }

  // --- conversation: c dumps IN ORDER (no char-counting) ---------------------------------

  function onChunk(f: Record<string, unknown>): void {
    const tag = String(f.tag ?? '');
    const c = typeof f.c === 'string' ? f.c : '';
    if (tag === 'TURN_START') {
      // open the reply row (the reply gutter: col0 = the right guillemet);
      // the live cell keeps spinning col 0 while the THRU window runs
      const i = lineCount();
      turning = true;
      turnLine = i;
      setLine('reply', i, '');
      scheduleScroll(true);
      return;
    }
    if (tag === 'ANS' && c) {
      let lines = text.split('\n');
      if (!turning || turnLine < 0) {
        const i = lines.length;
        turning = true;
        turnLine = i;
        lines.push('\u00BB ');
        text = lines.join('\n');
      }
      const cur = lines[turnLine] || '\u00BB ';
      lines[turnLine] = cur.slice(0, 2) + cur.slice(2) + c; // append IN ORDER
      text = lines.join('\n');
      scheduleScroll(true);
      return;
    }
    if (tag === 'DONE') {
      turning = false;
      // close-equivalent: re-arm the tail + focus() in the SAME rAF as
      // scroll-to-bottom (R5)
      arming = true;
      scheduleScroll(true);
    }
  }

  // --- G2: the at-bottom guard (same rAF as any append) ------------------------------------

  function settleReplyRow(): void {
    // the close-equivalent gutter re-issue: once the THRU window closes and
    // the reply row holds its text, rewrite the line's 2-char in-stream
    // gutter (» → the reply classifier) IN THE ONE text node, keyed by the
    // row table (row-id → line index) — element identity survives
    const lines = text.split('\n');
    if (turnLine < 0 || turnLine >= lines.length) return;
    const cur = lines[turnLine];
    if (cur.slice(0, 2) === '\u00BB ' && cur.slice(2).length > 0) {
      lines[turnLine] = '\u00BB ' + cur.slice(2);
      text = lines.join('\n');
    }
  }
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

  // --- Enter-freeze (preventDefault; echo on freeze; not live) --------------------------------

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing && !e.shiftKey) {
      e.preventDefault();
      const msg = draft;
      if (msg.length > 0) {
        usrSeq += 1;
        setLine('usr:' + usrSeq, lineCount(), msg); // freeze as a read-only row
        sendMsg(msg);                               // POST; the server echoes USR
      }
      draft = ''; // clear; the native caret stays in the textarea
    }
  }

  function sendMsg(msg: string): void {
    void fetch('/sse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg, session: sid }),
    }).catch(() => { /* wire down: the reply just doesn't come (mock brain) */ });
  }

  function connect(): void {
    sid = 'v3-' + Math.random().toString(36).slice(2, 10);
    const e = new EventSource('/sse?session=' + encodeURIComponent(sid) + '&tag=terminal');
    e.onmessage = onEvent;
  }

  // --- G1: the byte-exact width gate (post-font-load; no swap on fail) -------------------------

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

  // --- lifecycle --------------------------------------------------------------------------------

  onMount(() => {
    connect();
    window.addEventListener('keydown', onKey, true);
  });
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