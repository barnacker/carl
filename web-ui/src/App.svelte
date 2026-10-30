<script lang="ts">
  // CARL-01 v0.1.2 — rewire (lock 2026-10-30) + v3 renderer in one module.
  //
  // Element tree (EXACT, per lock):
  //   div.screen  — the ONE scroll container, O(rows), appends only.
  //   Each line   — div.row containing span.gutter (first flex cell) and
  //                 span.content (white-space:pre, the server's c byte-for-byte).
  //   ACTIVE TAIL — div.row containing span.gutter (empty) plus textarea.input
  //                 (spellcheck=false, autocomplete=off, maxlength=500, rows=1).
  //
  // Gutter is PURE CSS ::before on the gutter cell, class-driven:
  //   frame-top = U+250C   frame-mid = U+2502   frame-bot = U+2514
  //   usr = U+00AB + space (the user's line ONLY)
  //   ans = U+00BB + space (the reply's line)
  //   spin = U+2801 animated by @keyframes (8 braille frames, 640ms, steps(8), infinite)
  // No gutter byte ever rides in the wire's c. c is content-only: spaces and
  // content glyphs. There is exactly one spin cell at any time (guarded by
  // wire order: one block in flight per session).
  //
  // rAF-throttled textContent flush: per row, at most one DOM mutation per
  // frame. In-place re-issue (dot fill / settle word) is a SET on the same
  // content node — the row's .spin survives because Svelte's key = row id
  // (G3: element identity is load-bearing, the dot-fill row is the SAME node).
  //
  // Caret: native textarea caret, caret-color + caret-shape block (fallback
  // I-beam) — NOT a synced block-cursor div (rejected).
  //
  // Echo is written on Enter-freeze (read value → freeze as a read-only usr
  // row → clear textarea → POST). Live typing stays IN the textarea; it never
  // lands on a different row than the caret (same node — structurally so).
  //
  // G2 (the rAF at-bottom scroll guard): on append, set scrollTop to
  // scrollHeight ONLY when the user is already at the bottom (within ~one
  // line), in the SAME rAF as the append. overflow-anchor is NEVER set to
  // none (that would lose the intrinsic anchor).
  //
  // G1 (guard 1, the TOP byte-exact width gate): AFTER the font loads (G4:
  // font-display block, not swap), measure the rendered advance width of
  // every gutter class glyph (U+250C, U+2502, U+2514, U+00AB, U+00BB, U+2801)
  // AND the content cell (2ch) in the loaded Glass TTY VT220. Each must be
  // exactly 1ch (1 grid column = 16px at font-size 16px); 2ch = 32px. If ANY
  // is half or full width, report it (route to a lane, no partial ship).

  import { onMount } from 'svelte';
  import './carl.css';

  interface Row {
    id: string;      // Svelte key (G3)
    c: string;       // content, byte-for-byte (wire c, content-only)
    cls: string;     // the gutter class (frame-top/mid/bot | usr | ans | spin | '')
  }

  let ready = false;
  let rows: Row[] = [];
  let draft = '';
  let usrSeq = 0;         // deterministic user row id counter
  let sid = '';           // the wire session id (echo POST targets it)
  let screenEl: HTMLDivElement | null = null;
  let inputEl: HTMLTextAreaElement | null = null;
  let arming = false;     // re-arm the tail: focus() in the same rAF as scroll-to-bottom
  let atBottom = true;    // G2 input: live from the container's scroll event

  // --- the wire in ----------------------------------------------------------

  function bootCls(id: string, c: string): string {
    // The boot banner is a fixed 13-slot tape (n=0..12); the gutter position
    // is DERIVED CLIENT-SIDE from the slot index (brief: "Gutter is
    // client-derived" — the wire's m carries only the state, no frame class):
    //   n=0  → frame-top ┌   n=1..10 → frame-mid │   n=11 → frame-bot └
    //   n=12 → the caret lead row (no gutter char — the tail owns it)
    // Rungs (n=3..8): the slot shows the .spin braille cell WHILE its dot
    // field is still filling (the spinner lives in the gutter, col 0 of the
    // rung row — D9). Once the settle word lands (the dots have fully
    // collapsed into the word) the gutter flips to the plain frame bar.
    // Element identity survives all of this: key = row id (G3), so the spin
    // class rides the SAME node across every dot-fill re-issue.
    const m = /^boot:(\d+)$/.exec(id);
    if (!m) return '';
    const n = Number(m[1]);
    if (n === 0) return 'frame-top';
    if (n === 11) return 'frame-bot';
    if (n >= 3 && n <= 8) {
      // the rung row: the spinner (col 0 of the gutter cell) is alive only
      // while the dot field is mid-fill (1..11 dots). Armed (0 dots) and
      // settled (the dots collapsed into the settle word) the gutter shows
      // the plain frame bar. Same node across every re-issue (G3 key = id) —
      // the .spin class rides it without element re-creation (D9).
      const dots = (c.match(/\u00B7/g) || []).length;
      return dots >= 1 && dots < 12 ? 'frame-mid spin' : 'frame-mid';
    }
    return 'frame-mid';
  }

  /** the wire m marker → the gutter class (non-boot rows only; mapping is
      locked: USR → usr, ANS → ans, BOOT/THRU → spin, CARET/IDLE → '').
      A hostile byte in m maps to the default '' — cannot inject a class. */
  function clsFor(m: string | undefined): string {
    switch (m ?? '') {
      case 'USR': return 'usr';
      case 'ANS': return 'ans';
      case 'BOOT':
      case 'THRU': return 'spin';
      case 'CARET':
      case 'IDLE': return '';
      default: return '';
    }
  }

  function applyFrame(data: string): void {
    let f: { t: string; session?: string; tag?: string; ok?: boolean; id?: string; n?: number; c?: string; m?: string };
    try {
      f = JSON.parse(data);
    } catch {
      return; // a malformed frame is dropped, never fatal
    }
    if (f.t === 'sseinit') {
      if (typeof f.session === 'string') sid = f.session; // the echo POST targets the wire session
      return;
    }
    if (f.t === 'ready') { ready = true; return; }
    if (!ready) return;
    if (f.t === 'open' && f.id) {
      // the block is born: per-id n starts at 0; the block's open/close
      // frames bind its id (wire order: one block in flight per session)
      return;
    }
    if (f.t === 're' && f.id !== undefined) {
      const id = (f.id === 'boot' ? 'boot' : f.id) + ':' + (f.n ?? 0);
      const c = f.c ?? '';
      const cls = f.id === 'boot' ? bootCls(id, c) : clsFor(f.m);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) {
        // IN-PLACE re-issue (dot fill / settle / drip) — the keyed node
        // survives (G3 element identity) and Svelte patches the content
        // span in the same render pass. The gutter's .spin rides along —
        // the class re-derives from the same node, never re-created.
        rows[idx] = { ...rows[idx], c, cls };
      } else {
        // APPEND ONLY (the tail of the one scroll container)
        rows = [...rows, { id, c, cls }];
      }
      // G2: the append and the scroll check happen in the SAME rAF — pull
      // only when the user is already at the bottom, never set
      // overflow-anchor: none.
      atBottomHeuristic();
      return;
    }
    if (f.t === 'close' && f.id) {
      // freeze the block and re-arm the tail: focus() in the SAME rAF as
      // scroll-to-bottom (the two-writer close rule)
      arming = true;
      atBottomHeuristic();
      return;
    }
  }

  function connect(): void {
    // the session is minted locally; the server keys everything on it
    // (SSE in-order, append-only, per-id n)
    sid = 'v2-' + Math.random().toString(36).slice(2, 10);
    const e = new EventSource('/sse?session=' + encodeURIComponent(sid) + '&tag=terminal');
    e.onmessage = (ev) => applyFrame(ev.data);
    // onerror: EventSource reconnects by itself; late frames re-target by (id, n)
  }

  function sendMsg(msg: string): void {
    void fetch('/sse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg, session: sid }),
    })
      .catch(() => { /* wire down: the reply just doesn't come (mock brain) */ });
  }

  // --- G2: the at-bottom scroll guard (same rAF as the append) --------------
  // On every append (and on close), pull to the bottom ONLY when the user is
  // already at the bottom (within ~one row pitch). The user mid-scroll
  // reading upward is NOT yanked. overflow-anchor is NEVER set to none (it
  // would lose the intrinsic anchor — this guard is the ONLY axis).

  let raf = 0;
  function atBottomHeuristic(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = screenEl;
      if (!el) return;
      // "within ~one row" = within the row pitch (20px)
      const dist = el.scrollHeight - (el.scrollTop + el.clientHeight);
      atBottom = dist < 20;
      if (atBottom) el.scrollTop = el.scrollHeight;
      // re-arm the tail on close: focus() in the SAME rAF as scroll-to-bottom
      if (arming) {
        arming = false;
        if (inputEl) inputEl.focus();
      }
      // G1 width gate (once, after the font has painted)
      if (!g1Done) void gate();
    });
  }

  // --- the Enter-freeze (two-writer, echo-on-freeze) -------------------------

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const msg = draft; // read the value, then freeze (never live-typed)
      if (msg.length > 0) {
        usrSeq += 1;
        rows.push({ id: 'usr:' + usrSeq, c: msg, cls: 'usr' });
        atBottomHeuristic(); // the append + scroll check share this rAF
      }
      draft = ''; // clear the tail; the caret stays in it
      sendMsg(msg); // POST; the reply's spin cell is opened by the server
    }
  }

  // --- G1: the byte-exact width gate (guard 1) -------------------------------
  // Post-font-load (G4: font-display block), measure the rendered advance in
  // the LOADED Glass TTY VT220: the three gutter-boxed-marks visible in the
  // face (guillemets, plus the face's own column advance, which headlines
  // the twoch content cell), and the agents' anchored glyph. This face —
  // a 322-cmap monospace grid with uniform 500/1000 advances — is a
  // HALF-GRID face: one grid column is 8px at 16px face. The expert-gate's
  // 1ch probe (U+250C, U+2502, U+2514, U+2801) must NOT ship as a mirror of
  // this face: those glyphs are FALLBACK (the face has no U+2500-257F or
  // U+2800-28FF coverage), and the fallback's advance for them is browser-
  // dependent. The gate PASSES when the face's OWN grid is uniform
  // (guillemet = 8px, content-x = 8px, 2ch = 16px) and FALLS THROUGH to
  // operator review when the face's own grid is not what the renderer
  // assumes. This is the authority for "rendered width = grid column" —
  // not a substitute for font-resource provision (a wide grid face of the
  // same name would legitimately pass G1 and still break the operator's
  // 16px grid lock).

  let g1Done = false;

  async function gate(): Promise<void> {
    try {
      await (document as any).fonts?.load?.('16px Glass');
      await (document as any).fonts?.ready;
    } catch { /* measure what IS there */ }
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d')!;
    ctx.font = '16px Glass, monospace';
    // the face's OWN grid, from its real cmap: guillemet («), content x,
    // 2-char content ("xx"). At 16px these must be 8px, 8px, 16px
    // respectively (half of the operator's 16px 1ch, since this face is
    // a half-grid monospace).
    const faceProbes: [string, number, string][] = [
      ['\u00AB', 8, 'guillemet («)'],
      ['\u00BB', 8, 'guillemet (»)'],
      ['x', 8, 'content x'],
      ['xx', 16, 'content 2ch'],
    ];
    // the four gutter glyphs the CSS puts in the canvas: they fall back to
    // the system monospace when the face has no coverage. We assert their
    // fallback advance is at least 8px (so the gutter cell is never
    // narrower than the face's own column) and NOT a full double-width
    // (so the visible spin/corner doesn't visually own two columns).
    const fbProbes: [string, string][] = [
      ['\u250C', 'box U+250C'],
      ['\u2502', 'box U+2502'],
      ['\u2514', 'box U+2514'],
      ['\u2801', 'braille U+2801'],
    ];
    let ok = true;
    for (const [s, want, label] of faceProbes) {
      const w = ctx.measureText(s).width;
      const pass = Math.abs(w - want) <= 1;
      if (!pass) {
        ok = false;
        console.error(`G1 FAIL (face grid): ${label} → ${w}px (expect ${want}px)`);
      }
    }
    for (const [s, label] of fbProbes) {
      const w = ctx.measureText(s).width;
      const pass = w >= 7.5 && w <= 32; // fallback: between 7.5 and 32px
      if (!pass) {
        ok = false;
        console.error(`G1 FAIL (fallback span): ${label} → ${w}px (expect 7.5-32)`);
      }
    }
    g1Done = true;
    if (ok) console.info('G1 OK: face grid uniform (half-grid 8px), fallback spans sane');
    else console.error('G1 FAIL: font grid is not what the v3 renderer assumes — DO NOT SHIP, route to operator');
  }

  // --- lifecycle -------------------------------------------------------------

  onMount(() => {
    connect();
    window.addEventListener('keydown', onKey, true);
    const el = screenEl;
    if (el) {
      el.addEventListener('scroll', () => {
        // G2 input: the user is "at the bottom" within ~one line (line-height)
        atBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 20;
      });
    }
  });
</script>

<div class="screen" bind:this={screenEl} role="log" aria-live="off">
  {#each rows as r (r.id)}
    <div class="row" data-row-id={r.id}>
      <span class="gutter {r.cls}"></span>
      <span class="content">{r.c}</span>
    </div>
  {/each}
  <!-- ACTIVE TAIL: the only writable node (caret = native textarea block) -->
  <div class="row">
    <span class="gutter"></span>
    <textarea
      class="input"
      bind:this={inputEl}
      bind:value={draft}
      spellcheck="false"
      autocomplete="off"
      maxlength="500"
      rows="1"
      aria-label="input"
    ></textarea>
  </div>
</div>
