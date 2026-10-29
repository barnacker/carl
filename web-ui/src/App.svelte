<script lang="ts">
  // CARL-01 — the screen (CANON §1): full-screen dark terminal, no chrome.
  // The client is the assembler (CANON §4): the wire in, the tape painted.
  // No client looper; no server frame buffer; the server's pace is the
  // actual pace. The caret is client-side presentation — never a wire byte.
  import { onMount } from 'svelte';
  import { Assembler, SPIN } from './lib/assembler.js';
  import './carl.css';

  const asm = new Assembler();

  let screenHtml = '';
  let raf = 0;
  let spinI = 0; // braille phase for the in-flight user row (~100ms)
  let spinTimer: ReturnType<typeof setInterval> | null = null;
  let phaseTimer: ReturnType<typeof setInterval> | null = null;
  let es: EventSource | null = null;
  let sid = '';
  let lastState = '';

  function paint(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const h = asm.render(SPIN[spinI]);
      if (h !== screenHtml) screenHtml = h;
    });
  }

  // --- the wire in

  function onFrame(data: string): void {
    let f: import('./lib/assembler.js').WireFrame;
    try {
      f = JSON.parse(data);
    } catch {
      return; // a malformed frame is dropped, never fatal
    }
    asm.apply(f);
    paint();
  }

  function connect(): void {
    sid = 'v1-' + Math.random().toString(36).slice(2, 10);
    const e = new EventSource('/sse?session=' + encodeURIComponent(sid) + '&tag=terminal');
    es = e;
    e.onmessage = (ev) => onFrame(ev.data);
    // onerror: EventSource reconnects by itself; the spinner keeps spinning
    // while the wire is down, and late frames insert by n on resume
  }

  function sendMsg(msg: string): void {
    void fetch('/sse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg, session: sid }),
    })
      .then((r) => {
        if (r.status === 202) {
          asm.ack(); // the 202 is the door: spinner → « (client-local paint)
          watchPhase();
        }
      })
      .catch(() => {
        /* wire down: the spinner keeps spinning */
      });
  }

  // --- the spinner (gutter col 0 of the in-flight user row)

  function setSpin(on: boolean): void {
    if (on && spinTimer === null) {
      spinTimer = setInterval(() => {
        spinI = (spinI + 1) % 8;
        paint();
      }, 100);
    } else if (!on && spinTimer !== null) {
      clearInterval(spinTimer);
      spinTimer = null;
    }
  }

  function watchPhase(): void {
    const st = asm.sentState;
    if (st !== lastState) {
      lastState = st;
      setSpin(st === 'sending');
      paint();
    }
  }

  // --- the healthy local input line (keystrokes → content column)

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      if (e.isComposing) return;
      e.preventDefault();
      if (asm.sentState === 'edit' && asm.draft !== '') {
        const msg = asm.draft;
        asm.commit(); // freeze the row (no more edits on that line)
        watchPhase();
        sendMsg(msg);
      }
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (asm.sentState === 'edit') {
        asm.setDraft(asm.draft.slice(0, -1));
        paint();
      }
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (asm.sentState === 'edit') {
        asm.setDraft(asm.draft + e.key);
        paint();
      }
    }
  }

  onMount(() => {
    connect();
    window.addEventListener('keydown', onKey, true);
    phaseTimer = setInterval(watchPhase, 40);
    paint();
  });
</script>

<div class="terminal">
  <div class="screen" role="log" aria-live="off">
    {@html screenHtml}
  </div>
</div>
