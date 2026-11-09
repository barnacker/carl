<script lang="ts">
  // CARL-01 v0.2.1.1 — wire protocol V1 + LOCKED V1 render lifecycle
  // (boot→selftest, operator lock 2026-10-31; REPLACES the 14-row static
  // boot banner — nothing is pre-painted; every line arrives by wave).
  //
  // SHAPE EXACT (Form C, spec-of-record 2026-10-30):
  //   .screen  (100vw x 100vh, overflow hidden, flex column, bg #00040b)
  //   ▸ .history — ONE read-only <pre> (white-space:pre; flex 1 1 auto;
  //     min-height 0; overflow-y auto) = the ONLY scroller. Its ONE text
  //     node is the whole console — byte-exact. NO per-row div, NO
  //     per-line span. In-place re-issue (dot fill / settle) rewrites
  //     the line's substring IN THE ONE text node.
  //   ▸ .livecell — exactly ONE absolutely-positioned node, one gutter
  //     column wide, at column 0 of the active row. CSS @keyframes 8-
  //     braille steps(8) 640ms spinner. NO JS timer.
  //   ▸ .input  — the ONE writable node below the pre (one <textarea>,
  //     native block caret, maxlength 500, spellcheck false).
  //
  // WIRE V1:
  //   ENTRY  t=kd from=carl to=oper-<id> data={path:value}+hp={handle:path}
  //     → read oper-id from 'to', fold data, store the handle table.
  //   WAVE   t=kd from=<faculty> tick/seq_end dirty={handle:value}
  //     → decode handle via hp, apply to the local tree, then REACT.
  //     dirty-only (a settled handle is never re-sent); NO no-op waves.
  //   tx usr  → { t:'tx', from, to, kind:'usr', text }  (text TOP-LEVEL)
  //   tx op   → { t:'tx', from, to, kind:'op', data:{op} }  (data = object)
  //   tx ans  → seq 1..N within the reply; drop the chunk bytes in order.
  //
  // LOCKED V1 RENDER LIFECYCLE (boot → selftest):
  //   BOOT (an entry frame arrives):
  //     1. Read carl.version from data. Paint ONE line:
  //        "CARL · PROVISIONING TERMINAL <version>"
  //     2. IMMEDIATELY send the auto-request op:selftest → immu. No wait.
  //     3. Paint NOTHING else: no ROM, no MEM, no bars, no READY. No
  //        rung slots exist yet. Screen = version line, empty below it,
  //        the waiting spinner on.
  //     4. The entry's carl.rom / carl.mem are IGNORED (read-only fold;
  //        the handle table keeps them; they NEVER paint at boot).
  //   SELFTEST (driven by the server; the client has ZERO knowledge of
  //   order — it reacts to whatever arrives, in arrival order):
  //     • A rung's line is created FRESH when its mode:active wave lands:
  //       path carl.immu.selftest.<X>.mode → short <X> → LABEL. Never
  //       pre-created. Arrival order = ladder order.
  //     • progress waves (0→100, 12 steps): add a dot per increment —
  //       dotField(p) = round(p/100 * 12), clamped 0..12 (0@0, 6@50,
  //       7@60, 12@100).
  //     • Final-state wave on the mode handle:
  //           pass     → 12 dots + "OK @ <ms>ms"
  //           degraded → 12 dots + "DEGRADED @ <ms>ms"
  //           fault    → 12 dots + "FAULT"
  //         The <ms> rides its OWN handle (carl.immu.selftest.<X>.ms —
  //         a separate dirty key; the lock shape).
  //     • After the 6th rung FINALIZES: the rom/mem line is created (and
  //       updated by later carl.rom/carl.mem dirty waves — it is NOT
  //       recreated), and READY. paints.
  //
  // FORM-C gutter (every line: 2-char gutter col0/col1 + content):
  //     version line + 6 rungs + rom·mem: "  " (col0 state, col1 blank)
  //     READY.: "  "
  //     user reply: "» "  |  user echo: "« "

  import { onMount, onDestroy } from 'svelte';
  import './carl.css';

  const D = '\u00B7';   // the dot-field byte (in-stream content)
  const LH = 18;        // line pitch, px (G2 + the live cell's y)
  const HEAD_L = 'CARL \u00B7 PROVISIONING TERMINAL';
  const FIELD_WDTS = 12; // the 12-cell dot field (0..12 dots; 12 at 100)
  const TOTAL_RUNGS = 6;
  const LADDER_0 = 1;    // line 0 = version; the 6 rung slots = lines 1..6
  // the label decode: the client learns the faculty NAME from the decodable
  // path (carl.immu.selftest.<short>.mode) — short → LABEL. No order.
  const LABEL_OF: Record<string, string> = {
    dash: 'DASH', immu: 'IMMU', crtx: 'CRTX',
    tele: 'TELE', nerv: 'NERV', llm1: 'LLM1',
  };

  let draft = '';
  let sid = '';            // oper-<random> — read from the entry frame's 'to'
  let text = '';           // the ONE text node content
  let preEl: HTMLPreElement | null = null;
  let inputEl: HTMLTextAreaElement | null = null;
  let livecellEl: HTMLDivElement | null = null;
  let arming = false;

  // --- the V1 render state (event-driven; nothing pre-created) --------------------
  // `run` is a plain object of rung state, keyed by short (the faculty
  // learned from the decodable path). `runShorts` = the ladder (insertion
  // order = arrival order). `romMemIdx` = line of the rom·mem line (-1),
  // `readyIdx` = line of READY. (-1) — both created after the 6th rung.
  const run: Record<string, { label: string; mode: string; dots: number; ms: number | null; finalized: boolean }> = {};
  const runShorts: string[] = [];
  let romMemIdx = -1;
  let readyIdx = -1;
  const live = { row: -1 };

  // the client fold of the server tree (entry data + kd waves)
  const tree = new Map<string, string | number | boolean | object | null>();
  const handleToPath = new Map<string, string>(); // hp: handle → dotted path

  // --- line plumbing (the ONE text node: append + in-place re-issue) ------------

  function lineCount(): number {
    return text === '' ? 0 : text.split('\n').length;
  }

  function putAt(i: number, g: string, content: string): void {
    const lines = text.split('\n');
    while (lines.length <= i) lines.push('');
    lines[i] = g + content;
    text = lines.join('\n');
  }

  // --- the V1 renderer ------------------------------------------------------------

  function dotField(n: number): string {
    const k = Math.min(FIELD_WDTS, Math.max(0, n));
    return D.repeat(k) + ' '.repeat(FIELD_WDTS - k);
  }

  function finalWord(r: { mode: string; ms: number | null; finalized: boolean }): string | null {
    if (r.mode === 'pass') return 'OK @ ' + Number(r.ms).toFixed(1) + 'ms';
    if (r.mode === 'degraded') return 'DEGRADED @ ' + Number(r.ms ?? 0).toFixed(1) + 'ms';
    if (r.mode === 'fault' || r.mode === 'fail') return 'FAULT';
    return null;
  }

  function rungBody(r: { label: string; mode: string; dots: number; ms: number | null; finalized: boolean }): string {
    const n = r.finalized ? FIELD_WDTS : r.dots;
    const field = dotField(n) + ' ';
    const w = finalWord(r);
    return '> ' + r.label + ' ' + field + (w ?? '');
  }

  const SEL_RE = /^carl\.immu\.selftest\.([a-z0-9]+)\.(mode|progress|ms)$/;

  function romLineBody(): string {
    const rom = tree.get('carl.rom');
    const mem = tree.get('carl.mem');
    const r = (rom === null || rom === undefined) ? 'ROM --k' : 'ROM ' + rom + 'k';
    const m = (mem === null || mem === undefined) ? 'MEM --.-MB' : 'MEM ' + Number(mem).toFixed(1) + 'MB';
    return r + ' \u00B7 ' + m;
  }

  function romOk(): boolean {
    const rom = tree.get('carl.rom'), mem = tree.get('carl.mem');
    return (rom !== null && rom !== undefined) && (mem !== null && mem !== undefined);
  }

  // full repaint: state-driven. The DIFF is kept intentionally small:
  //  - rungs: in-place reissue of the rung lines (1..6)
  //  - rom·mem: created AFTER the 6th rung (romMemIdx stays; in-place in the
  //    moment any carl.rom/carl.mem wave re-arrives)
  //  - READY.: painted when all 6 rungs have their FINAL mode + rom/mem ok
  function repaint(): void {
    // rung lines (always in place once created; empty when no ladder yet)
    for (let i = 0; i < runShorts.length; i++) {
      const r = run[runShorts[i]];
      putAt(LADDER_0 + i, '  ', rungBody(r));
    }
    // rom·mem line (created after rung 6)
    const done = runShorts.length === TOTAL_RUNGS
      && runShorts.every(s => run[s].finalized);
    if (done && romMemIdx === -1 && romOk()) {
      romMemIdx = LADDER_0 + TOTAL_RUNGS;
      putAt(romMemIdx, '  ', romLineBody());
    }
    if (romMemIdx >= 0) putAt(romMemIdx, '  ', romLineBody());
    // READY. (after rung 6 + rom/mem)
    if (done && romOk() && romMemIdx !== -1 && readyIdx === -1) {
      readyIdx = romMemIdx + 1;
      putAt(readyIdx, '  ', 'READY.');
    }
    placeLiveCell();
    scheduleScroll(true);
  }

  // the waiting / selftest spinner: col 0 of the LADDER's first line while
  // waiting (no rung yet); col 0 of the ACTIVE rung's line while one ramps;
  // col 0 of the CRTX rung line while a chat turn is live.
  function placeLiveCell(): void {
    const lc = livecellEl;
    if (!lc) return;
    const activeShort = runShorts.find(s => run[s].mode === 'active');
    const activeLine = activeShort ? LADDER_0 + runShorts.indexOf(activeShort) : -1;
    const crtxLine = runShorts.indexOf('crtx');
    const crtxRowLine = crtxLine >= 0 ? LADDER_0 + crtxLine : -1;
    let row = -1;
    if (runShorts.length === 0) row = LADDER_0 - 1; // waiting below the version line
    else if (activeLine >= 0) row = activeLine;
    else if (crtxMode() === 'active' && crtxRowLine >= 0) row = crtxRowLine;
    if (row < 0) { live.row = -1; lc.classList.toggle('spin', false); lc.style.display = 'none'; return; }
    live.row = row;
    lc.classList.toggle('spin', true);
    lc.style.display = 'block';
    lc.style.top = (row * LH) + 'px';
  }

  // the crtx mode flip (chat turn): active = spin on the crtx rung row + open
  // the reply row; service = the cell dies and focus returns to the input.
  function crtxMode(): unknown {
    const v = tree.get('carl.faculties.crtx');
    return (typeof v === 'object' && v !== null) ? (v as { mode?: unknown }).mode : null;
  }

  let replyOpen = false;
  let replyLine = -1;
  let seq = 0;

  function onTx(f: Record<string, unknown>): void {
    const kind = String(f.kind ?? '');
    const to = String(f.to ?? '');
    if (to && sid && to !== sid) return; // chat routes to the specific session
    if (kind !== 'ans') return;
    const n = Number(f.seq ?? 0);
    const c = typeof f.text === 'string' ? f.text : '';
    if (!c) return;
    if (!replyOpen || n < seq) {
      if (!replyOpen) {
        replyLine = lineCount();
        replyOpen = true;
        seq = 1;
      }
      if (n < seq) seq = 1;
    }
    seq = Math.max(seq, n);
    appendReplyChunk(c);
    scheduleScroll(true);
  }

  function appendReplyChunk(c: string): void {
    const lines = text.split('\n');
    if (replyLine < 0) replyLine = lines.length;
    const cur = lines[replyLine] || '\u00BB ';
    lines[replyLine] = cur.slice(0, 2) + cur.slice(2) + c;
    text = lines.join('\n');
  }

  // --- the wire V1: entry + waves (kd) ---------------------------------------------

  function onEvent(e: MessageEvent): void {
    let f: Record<string, unknown>;
    try { f = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
    if (f.t === 'kd') onKd(f);
    else if (f.t === 'tx') onTx(f);
  }

  function onKd(f: Record<string, unknown>): void {
    const to = typeof f.to === 'string' ? f.to : '';
    if (to && !to.startsWith('oper-')) return; // not this session
    const data = f.data as { [p: string]: string | number | boolean | object | null } | undefined;
    const dirty = f.dirty as { [h: string]: string | number | boolean | object | null } | undefined;

    if (data !== undefined && f.from === 'carl') {
      // ENTRY (also the V1 reconnect re-snapshot): full tree + fresh hp.
      // Re-arm COLD on every entry (reconnect = re-render the lifecycle).
      sid = to;
      for (const k of Object.keys(run)) delete run[k];
      runShorts.length = 0;
      romMemIdx = -1;
      readyIdx = -1;
      replyOpen = false; replyLine = -1; seq = 0;
      text = '';
      for (const p of Object.keys(data)) tree.set(p, data[p]);
      const hp = f.hp as { [k: string]: string } | undefined;
      if (hp) { handleToPath.clear(); for (const k of Object.keys(hp)) handleToPath.set(k, hp[k]); }
      // (0) seed ladder state from the folded tree (hp order = the server's
      //     rung creation order = the sweep order). A rung seeds only if its
      //     mode is not idle (service): boot entries have ALL 6 at service
      //     (the server's mid-boot sweep already completed) → nothing seeds;
      //     a mid-sweep reconnect seeds whatever is active/finalized already.
      for (const [h, p] of handleToPath) {
        const m = SEL_RE.exec(p);
        if (!m || m[2] !== 'mode') continue;
        const short = m[1];
        if (run[short]) continue; // one mode path per short (hp dedupes by path)
        const modeVal = data[p as string];
        if (modeVal === 'active' || modeVal === 'pass' || modeVal === 'degraded' || modeVal === 'fault' || modeVal === 'fail') {
          const prog = Number(data['carl.immu.selftest.' + short + '.progress'] ?? 0);
          const msVal = data['carl.immu.selftest.' + short + '.ms'];
          const isFinal = modeVal === 'pass' || modeVal === 'degraded' || modeVal === 'fault' || modeVal === 'fail';
          run[short] = {
            label: LABEL_OF[short] ?? short.toUpperCase(),
            mode: String(modeVal),
            dots: isFinal ? FIELD_WDTS : Math.min(FIELD_WDTS, Math.max(0, Math.round(prog / 100 * FIELD_WDTS))),
            ms: (msVal === null || msVal === undefined) ? null : Number(msVal),
            finalized: isFinal,
          };
          runShorts.push(short);
        }
      }
      // (1) the version line ONLY (the entry's rom/mem are folded but IGNORED)
      putAt(0, '  ', HEAD_L + ' ' + String(tree.get('carl.version') ?? ''));
      // (2) the auto-request op:selftest → immu IMMEDIATELY (the server
      //     queues if a sweep is in flight). Once per entry.
      sendWire({ t: 'tx', from: to, to: 'immu', kind: 'op', data: { op: 'selftest' } });
      // (3) paint seeded rungs (mid-sweep reconnect only) + place the cell
      repaint();
      return;
    }

    if (dirty === undefined) return;
    // WAVE: decode handles via hp, apply to the tree, decode reactions.
    let changed = false;
    for (const h of Object.keys(dirty)) {
      const p = handleToPath.get(h);
      if (p === undefined) continue;
      const v = dirty[h];
      tree.set(p, v);
      if (p === 'carl.rom' || p === 'carl.mem') { changed = true; continue; }
      const m = SEL_RE.exec(p);
      if (!m) continue;
      const short = m[1]; const part = m[2];
      if (part === 'mode' && v === 'active' && !run[short]) {
        if (runShorts.length >= TOTAL_RUNGS) continue; // no 7th slot
        run[short] = {
          label: LABEL_OF[short] ?? short.toUpperCase(),
          mode: 'active', dots: 0, ms: null, finalized: false,
        };
        runShorts.push(short);
        changed = true;
      } else if (run[short]) {
        const r = run[short];
        if (part === 'progress') {
          r.dots = Math.min(FIELD_WDTS, Math.max(0, Math.round(Number(v) / 100 * FIELD_WDTS)));
          changed = true;
        } else if (part === 'ms') {
          r.ms = Number(v);
          changed = true;
        } else if (part === 'mode' && !r.finalized && (v === 'pass' || v === 'degraded' || v === 'fault' || v === 'fail')) {
          r.mode = String(v);
          r.finalized = true;
          changed = true;
        }
      }
    }
    if (changed) repaint();
  }

  // --- the tx send (LOCKED per-kind shapes) --------------------------------------------

  function sendWire(frame: { t: string; from: string; to: string; kind: string; [k: string]: unknown }): void {
    void fetch('/sse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(frame),
    }).catch(() => { /* wire down: the reply just doesn't come */ });
  }

  function sendChat(to: string, msg: string): void {
    // { t:'tx', from, to, kind:'usr', text } — `text` TOP-LEVEL (not data:text)
    sendWire({ t: 'tx', from: sid, to, kind: 'usr', text: msg });
  }

  // --- G2: the at-bottom guard (same rAF as any append) -------------------------------

  let raf = 0;
  function scheduleScroll(force = false): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = preEl;
      if (el) {
        const dist = el.scrollHeight - (el.scrollTop + el.clientHeight);
        if (force || dist < LH) el.scrollTop = el.scrollHeight;
      }
      if (arming) { arming = false; inputEl?.focus(); }
      if (!g1Done) void gate();
    });
  }

  let g1Done = false;

  // --- Enter-freeze (preventDefault; echo on freeze; not live) ----------------------------

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing && !e.shiftKey) {
      e.preventDefault();
      const msg = draft;
      if (msg.length > 0 && sid) {
        setLine('usr:' + lineCount(), lineCount(), msg);
        sendChat('crtx', msg);
      }
      draft = '';
    }
  }

  function setLine(id: string, lineIdx: number, content: string): void {
    const lines = text.split('\n');
    while (lines.length <= lineIdx) lines.push('');
    const g = id.startsWith('usr:') ? '\u00AB ' : '\u00BB ';
    lines[lineIdx] = g + content;
    text = lines.join('\n');
  }

  // --- the wire connect: no id; the server mints oper-<id> (entry 'to') ----------------

  let es: EventSource | null = null;
  function connect(): void {
    const e = new EventSource('/sse'); // no id, no tag — the 't' field IS the type
    es = e;
    e.onmessage = onEvent;
  }

  // --- G1: the byte-exact width gate (post-font-load; no swap on fail) ------------------

  async function gate(): Promise<void> {
    try { document.fonts?.load?.('16px Glass'); await document.fonts?.ready; } catch { /* measure as-is */ }
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d')!;
    ctx.font = '16px Glass, monospace';
    const x1 = ctx.measureText('x').width;
    g1Done = true;
    if (!(x1 > 0)) console.error('G1 FAIL: face unloaded — measure as-is');
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
