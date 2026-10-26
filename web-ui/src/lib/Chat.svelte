<script lang="ts">
  import { onMount } from 'svelte';

  const SYSTEM_PROMPT = 'You are the response faculty for CARL. Respond concisely.';
  const SESSION_KEY = 'carl.web-ui.v1';

  type Msg = {
    kind: 'user' | 'assistant' | 'system';
    text: string;
    reasoningText?: string;
    contentText?: string;
    done?: boolean;
  };

  let history = $state<Msg[]>([]);
  let input = $state('');
  let sending = $state(false);
  let streaming = $state(false);
  let lampState = $state<'idle' | 'posting' | 'receiving'>('idle');
  let controller: AbortController | null = null;
  let lastFirstByte: number | null = $state(null);
  let lastLastByte: number | null = $state(null);
  let logEl: HTMLDivElement;
  let inputEl: HTMLInputElement;

  function scrollToBottom() {
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  }

  function formatTs(ms: number | null) {
    return ms === null ? '—' : new Date(ms).toISOString().split('T')[1];
  }

  function pushAssistantToken(
    frame: { choices?: Array<{ delta?: { role?: string; content?: string; reasoning?: string } }> } | undefined,
    fallback: string,
  ) {
    if (lastFirstByte === null) lastFirstByte = Date.now();
    const delta = frame?.choices?.[0]?.delta;
    const reasoningPiece = delta?.reasoning;
    const contentPiece = delta?.content;
    // Role-marker-only frames append nothing; if nothing lands at all (e.g. the
    // wire sent a bare non-JSON token) keep the legacy behaviour: append verbatim
    // to the Content lane so no token is dropped.
    const useFallback =
      reasoningPiece === undefined && contentPiece === undefined && fallback.length > 0;
    streaming = true;
    const lastIdx = history.length - 1;
    if (lastIdx < 0) return;
    const cur = history[lastIdx];
    if (!cur || cur.kind !== 'assistant') return;
    const reasoning =
      reasoningPiece !== undefined && reasoningPiece.length > 0
        ? reasoningPiece
        : useFallback
          ? fallback
          : '';
    const content =
      contentPiece !== undefined && contentPiece.length > 0
        ? contentPiece
        : useFallback
          ? fallback
          : '';
    if (reasoning === '' && content === '') return;
    const next = history.slice();
    next[lastIdx] = {
      ...cur,
      text: cur.text + reasoning + content,
      reasoningText: (cur.reasoningText ?? '') + reasoning,
      contentText: (cur.contentText ?? '') + content,
    };
    history = next;
    setTimeout(scrollToBottom, 0);
  }

  function markAssistantDone() {
    const lastIdx = history.length - 1;
    if (lastIdx >= 0) {
      const cur = history[lastIdx];
      if (cur && cur.kind === 'assistant' && !cur.done) {
        const next = history.slice();
        next[lastIdx] = { ...cur, done: true };
        history = next;
      }
    }
    if (lastLastByte === null) lastLastByte = Date.now();
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(history));
    } catch {
      // storage unavailable
    }
    setTimeout(scrollToBottom, 0);
  }

  function pushSystemAndSave(text: string) {
    history.push({ kind: 'system', text, done: true });
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(history));
    } catch {
      // storage unavailable
    }
    setTimeout(scrollToBottom, 0);
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Msg[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const m of parsed) history.push(m);
      }
    } catch {
      // bad session
    }
  }

  onMount(() => {
    loadSession();
    setTimeout(() => inputEl?.focus(), 0);
  });

  async function send() {
    const text = input.trim();
    if (text.length === 0 || sending) return;
    input = '';
    sending = true;
    lampState = 'posting';
    lastFirstByte = null;
    lastLastByte = null;
    inputEl?.focus();

    history.push({ kind: 'user', text, done: true });
    history.push({ kind: 'assistant', text: '', done: false });
    setTimeout(scrollToBottom, 0);

    controller = new AbortController();
    try {
      const res = await fetch('/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf8');
      let buf = '';
      let got = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          lampState = 'idle';
          break;
        }
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          for (const line of frame.split('\n')) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') {
              lampState = 'idle';
              continue;
            }
            let parsed: {
              choices?: Array<{ delta?: { role?: string; content?: string; reasoning?: string } }>;
            } | undefined;
            try {
              parsed = JSON.parse(payload);
            } catch {
              parsed = undefined;
            }
            pushAssistantToken(parsed, payload);
            if (
              lampState === 'posting' &&
              ((typeof parsed?.choices?.[0]?.delta?.reasoning === 'string' && parsed.choices[0].delta.reasoning !== '') ||
               (typeof parsed?.choices?.[0]?.delta?.content === 'string' && parsed.choices[0].delta.content !== ''))
            ) {
              lampState = 'receiving';
            }
            got = true;
          }
        }
      }
      markAssistantDone();
      streaming = false;
      if (!got) pushSystemAndSave('stream ended with no tokens');
    } catch (err) {
      lampState = 'idle';
      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'aborted'
          : err instanceof Error
            ? err.message
            : String(err);
      pushSystemAndSave(message || 'stream failed');
      markAssistantDone();
    } finally {
      sending = false;
      streaming = false;
      controller = null;
      setTimeout(scrollToBottom, 0);
    }
  }

  function stop() {
    controller?.abort();
  }
</script>

<div class="col">
  <header class="head">
    <span class="head-title">CARL — web UI v1</span>
    <span class="head-meta">
      <span
        class="lamp lamp-{lampState}"
        role="button"
        aria-live="polite"
        tabindex="0"
        title={lampState.toUpperCase()}
      >
        {lampState.toUpperCase()}
      </span>
      <span class="meta-line">
        <span class="meta-k">harness</span>
        <span class="meta-v">localhost:3000</span>
      </span>
      <span class="meta-line">
        <span class="meta-k">model</span>
        <span class="meta-v">Qwen3.8-27B-FP8</span>
      </span>
    </span>
  </header>

  <div class="log" bind:this={logEl}>
    {#if history.length === 0}
      <p class="hint">Type a prompt below — tokens stream in as the model emits them.</p>
    {:else}
      {#each history as m, i (i)}
        <div class="row {m.kind}">
          <span class="who">{m.kind === 'user' ? 'you' : m.kind === 'system' ? 'harness' : 'carl'}</span>
          {#if m.kind === 'assistant'}
            <div class="reply-boxes">
              <div class="box reasoning">
                <span class="box-title">Reasoning</span>
                <pre class="box-body">{m.reasoningText ?? ''}{!m.done ? '▌' : ''}</pre>
              </div>
              <div class="box content">
                <span class="box-title">Content</span>
                <pre class="box-body">{m.contentText ?? ''}{!m.done ? '▌' : ''}</pre>
              </div>
            </div>
          {:else}
            <pre class="bubble {m.kind}">{m.text}</pre>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="input-row">
    <input
      bind:this={inputEl}
      bind:value={input}
      type="text"
      autocomplete="off"
      placeholder="say hi"
      disabled={sending}
      onkeydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          void send();
        }
      }}
    />
    {#if sending}
      <button class="stop" onclick={stop}>Stop</button>
    {:else}
      <button class="send" onclick={() => send()} disabled={input.trim().length === 0}>Send</button>
    {/if}
  </div>

  <footer class="foot">
    <span class="foot-k">firstByte</span>
    <span class="foot-v">{formatTs(lastFirstByte)}</span>
    <span class="foot-sep">·</span>
    <span class="foot-k">lastByte</span>
    <span class="foot-v">{formatTs(lastLastByte)}</span>
  </footer>
</div>

<style>
  .col {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 880px;
    margin: 0 auto;
    padding: 16px;
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 8px 4px;
    border-bottom: 1px solid var(--line);
  }
  .head-title {
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 13px;
    color: var(--ink);
  }
  .head-meta {
    margin-left: auto;
    display: flex;
    gap: 14px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
  }
  .meta-line {
    display: inline-flex;
    gap: 6px;
    align-items: baseline;
  }
  .meta-k {
    color: var(--ink-3);
  }
  .meta-v {
    color: var(--ink-2);
  }
  .lamp {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e5484d;
    font-size: 0;
    color: transparent;
    outline: none;
    flex-shrink: 0;
  }
  .lamp-idle {
    background-color: #e5484d;
  }
  .lamp-posting {
    background-color: #d29922;
  }
  .lamp-receiving {
    background-color: #3fb950;
  }
  .lamp:focus-visible,
  .lamp:hover {
    font-size: 9px;
    color: var(--ink-3);
  }
  .log {
    flex: 1;
    overflow: auto;
    padding: 4px 6px;
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hint {
    color: var(--ink-3);
    margin: 0;
    font-size: 13px;
    padding: 8px 4px;
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .row.user {
    justify-content: flex-end;
  }
  .row.user .who {
    display: none;
  }
  .who {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding-top: 6px;
    min-width: 56px;
    flex-shrink: 0;
  }
  .bubble {
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.5;
    margin: 0;
    padding: 8px 12px;
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 78%;
    border: 1px solid var(--line);
  }
  .user .bubble {
    background: var(--user);
    border-color: var(--line-2);
    color: var(--ink);
  }
  .assistant {
    flex: 1;
    min-width: 0;
  }
  .assistant .reply-boxes {
    display: flex;
    gap: 8px;
    flex: 1;
    min-width: 0;
    align-items: flex-start;
  }
  @media (max-width: 719.98px) {
    .assistant .reply-boxes {
      flex-direction: column;
    }
  }
  .box {
    flex: 1;
    min-width: 0;
    border-radius: 8px;
    background: var(--panel-2);
    border: 1px solid var(--line);
  }
  .box.reasoning {
    border-left: 2px solid #e5484d;
  }
  .box.content {
    border-left: 2px solid #3fb950;
  }
  .box-title {
    display: block;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 6px 12px 2px;
  }
  .box-body {
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.5;
    margin: 0;
    padding: 2px 12px 8px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ink);
  }
  .system .bubble {
    background: transparent;
    border: 1px dashed var(--line-2);
    color: var(--accent-2);
    font-size: 12px;
  }
  .input-row {
    display: flex;
    gap: 8px;
  }
  .input-row input {
    flex: 1;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    color: var(--ink);
    font-family: var(--mono);
    font-size: 14px;
    outline: none;
  }
  .input-row input:focus {
    border-color: var(--accent);
  }
  .input-row input:disabled {
    opacity: 0.5;
  }
  .send,
  .stop {
    padding: 0 18px;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent-2);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .send:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .stop {
    border-color: #ff8066;
    color: #ffb39e;
  }
  .foot {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
    padding: 4px 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: baseline;
  }
  .foot-k {
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .foot-v {
    color: var(--ink-2);
  }
  .foot-sep {
    color: var(--ink-3);
    opacity: 0.5;
  }
</style>
