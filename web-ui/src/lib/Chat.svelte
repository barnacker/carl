<script lang="ts">
  import { onMount } from 'svelte';

  // Default values for the visible, editable parameter fields below — not
  // wire constants: every byte sent to vLLM comes from a field on this page.
  const DEFAULT_MODEL = 'Qwen/Qwen3.8-27B-FP8';
  const DEFAULT_SYSTEM_PROMPT = 'You are the response faculty for CARL. Respond concisely.';
  const SESSION_KEY = 'carl.web-ui.v1';

  type Role = 'system' | 'user' | 'assistant';

  let reasoningText = $state('');
  let contentText = $state('');
  let streamDone = $state(false);
  let input = $state('');
  let sending = $state(false);
  let streaming = $state(false);
  let lampState = $state<'idle' | 'posting' | 'receiving'>('idle');
  let controller: AbortController | null = null;
  let lastFirstByte: number | null = $state(null);
  let lastLastByte: number | null = $state(null);
  let reasoningEl: HTMLPreElement;
  let contentEl: HTMLPreElement;
  let inputEl: HTMLInputElement;

  // Visible, editable request parameters (everything sent to vLLM).
  const DEFAULT_BASE_URL = 'http://10.240.232.32:8000';
  let baseUrl = $state(DEFAULT_BASE_URL);
  let model = $state(DEFAULT_MODEL);
  let systemRole = $state<Role>('system');
  let systemText = $state(DEFAULT_SYSTEM_PROMPT);
  let userRole = $state<Role>('user');
  let stream = $state(true);
  let systemOpen = $state(false);
  let temperature = $state('1.0');
  let top_p = $state('1.0');
  let max_tokens = $state('');
  let stop = $state('');
  let presence_penalty = $state('0.0');
  let frequency_penalty = $state('0.0');
  let seed = $state('');
  let n = $state('');

  function scrollPanels() {
    if (reasoningEl) reasoningEl.scrollTop = reasoningEl.scrollHeight;
    if (contentEl) contentEl.scrollTop = contentEl.scrollHeight;
  }

  function formatTs(ms: number | null) {
    return ms === null ? '—' : new Date(ms).toISOString().split('T')[1];
  }

  function pushAssistantToken(lane: 'reasoning' | 'content', tok: string) {
    if (lastFirstByte === null) lastFirstByte = Date.now();
    if (lampState === 'posting' && tok.length > 0) lampState = 'receiving';
    streaming = true;
    if (tok.length === 0) return;
    if (lane === 'reasoning') {
      reasoningText += tok;
      setTimeout(() => {
        if (reasoningEl) reasoningEl.scrollTop = reasoningEl.scrollHeight;
      }, 0);
      return;
    }
    contentText += tok;
    setTimeout(() => {
      if (contentEl) contentEl.scrollTop = contentEl.scrollHeight;
    }, 0);
  }

  function markAssistantDone() {
    streamDone = true;
    if (lastLastByte === null) lastLastByte = Date.now();
    setTimeout(scrollPanels, 0);
  }

  function focusInput() {
    setTimeout(() => inputEl?.focus(), 0);
  }

  onMount(focusInput);

  async function send() {
    const text = input.trim();
    if (text.length === 0 || sending) return;
    input = '';
    sending = true;
    lampState = 'posting';
    lastFirstByte = null;
    lastLastByte = null;
    reasoningText = '';
    contentText = '';
    streamDone = false;

    controller = new AbortController();
    try {
      const sysTrimmed = systemText.trim();
      const messages: { role: Role; content: string }[] = [];
      if (sysTrimmed.length > 0) {
        messages.push({ role: systemRole, content: systemText });
      }
      messages.push({ role: userRole, content: text });

      const body: Record<string, unknown> = {
        model,
        messages,
        stream,
      };
      const bu = baseUrl.trim();
      if (bu.length > 0) body.base_url = bu;
      const t = parseFloat(temperature);
      if (!Number.isNaN(t) && t > 0) body.temperature = t;
      const tp = parseFloat(top_p);
      if (!Number.isNaN(tp) && tp > 0) body.top_p = tp;
      const mt = parseInt(max_tokens, 10);
      if (!Number.isNaN(mt) && mt > 0) body.max_tokens = mt;
      const stopTrimmed = stop.trim();
      if (stopTrimmed.length > 0) body.stop = stopTrimmed.split(',').map((s) => s.trim());
      const pp = parseFloat(presence_penalty);
      if (!Number.isNaN(pp) && pp !== 0) body.presence_penalty = pp;
      const fp = parseFloat(frequency_penalty);
      if (!Number.isNaN(fp) && fp !== 0) body.frequency_penalty = fp;
      const seedInt = parseInt(seed, 10);
      if (seed.trim().length > 0 && Number.isInteger(seedInt) && seedInt >= 0) body.seed = seedInt;
      const nInt = parseInt(n, 10);
      if (n.trim().length > 0 && Number.isInteger(nInt) && nInt >= 1) body.n = nInt;

      const res = await fetch('/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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
            let parsed: { lane?: 'reasoning' | 'content'; tok?: string } | undefined;
            try {
              parsed = JSON.parse(payload);
            } catch {
              parsed = undefined;
            }
            if (parsed && (parsed.lane === 'reasoning' || parsed.lane === 'content') && typeof parsed.tok === 'string') {
              pushAssistantToken(parsed.lane, parsed.tok);
            } else {
              pushAssistantToken('content', payload);
            }
            got = true;
          }
        }
      }
      markAssistantDone();
      streaming = false;
    } catch (err) {
      lampState = 'idle';
      markAssistantDone();
    } finally {
      sending = false;
      streaming = false;
      controller = null;
      setTimeout(scrollPanels, 0);
      focusInput();
    }
  }

  function abortStream() {
    controller?.abort();
  }
</script>

<div class="col">
  <header class="head">
    <span class="head-title">CARL — WEB UI</span>
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
    <select class="role-select" bind:value={userRole} aria-label="user message role">
      <option value="user">user</option>
      <option value="system">system</option>
      <option value="assistant">assistant</option>
    </select>
    {#if sending}
      <button class="stop" onclick={abortStream}>Stop</button>
    {:else}
      <button class="send" onclick={() => send()} disabled={input.trim().length === 0}>Send</button>
    {/if}
  </div>

  <section class="panel system-panel">
    <button class="panel-toggle" onclick={() => (systemOpen = !systemOpen)} aria-expanded={systemOpen}>
      <span class="panel-title">SYSTEM (optional — empty = no system message sent)</span>
      <span class="toggle-mark">{systemOpen ? '−' : '+'}</span>
    </button>
    {#if systemOpen}
      <div class="system-body">
        <select class="role-select" bind:value={systemRole} aria-label="system message role">
          <option value="system">system</option>
          <option value="user">user</option>
          <option value="assistant">assistant</option>
        </select>
        <textarea
          class="system-textarea"
          bind:value={systemText}
          rows="3"
          placeholder="(empty — no system message sent)"
        ></textarea>
      </div>
    {/if}
  </section>

  <section class="panel reasoning-panel">
    <span class="panel-title">Reasoning</span>
    <pre class="panel-body" bind:this={reasoningEl}>{reasoningText}{!streamDone && streaming ? '▌' : ''}</pre>
  </section>

  <section class="panel content-panel">
    <span class="panel-title">Content</span>
    <pre class="panel-body" bind:this={contentEl}>{contentText}{!streamDone && streaming ? '▌' : ''}</pre>
  </section>

  <section class="panel params-panel">
    <span class="panel-title">Parameters (vLLM /v1/chat/completions)</span>
    <div class="params-body">
      <label class="param-row">
        <span class="param-label">base_url</span>
        <input class="param-input" bind:value={baseUrl} type="text" autocomplete="off" spellcheck="false" placeholder="vLLM endpoint (empty → server default)" />
      </label>
      <label class="param-row">
        <span class="param-label">model</span>
        <input class="param-input" bind:value={model} type="text" autocomplete="off" />
      </label>
      <label class="param-row param-row-inline">
        <span class="param-label">stream</span>
        <input type="checkbox" bind:checked={stream} />
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
        <span class="param-label">stop</span>
        <input class="param-input" bind:value={stop} type="text" autocomplete="off" placeholder="comma-separated (empty → omit)" />
      </label>
      <label class="param-row">
        <span class="param-label">presence_penalty</span>
        <input class="param-input" bind:value={presence_penalty} type="number" step="0.1" />
      </label>
      <label class="param-row">
        <span class="param-label">frequency_penalty</span>
        <input class="param-input" bind:value={frequency_penalty} type="number" step="0.1" />
      </label>
      <label class="param-row">
        <span class="param-label">seed</span>
        <input class="param-input" bind:value={seed} type="number" placeholder="(empty → omit)" />
      </label>
      <label class="param-row">
        <span class="param-label">n</span>
        <input class="param-input" bind:value={n} type="number" placeholder="(empty → omit)" />
      </label>
      <p class="wire-line">
        <span class="param-label">wire</span>
        content-type: application/json · accept: text/event-stream · auth: none
      </p>
    </div>
  </section>

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
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 40vh;
    background: var(--panel);
    border-radius: 8px;
    border-left: 2px solid #1d2a38;
  }
  .panel.reasoning-panel {
    border-left-color: #e5484d;
  }
  .panel.content-panel {
    border-left-color: #3fb950;
  }
  .panel-title {
    position: absolute;
    top: -8px;
    left: 12px;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    background: var(--bg);
    padding: 0 6px;
  }
  .panel-body {
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.5;
    margin: 0;
    padding: 2px 12px 8px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ink);
    overflow-y: auto;
    min-height: 40px;
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
  .role-select {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 10px;
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 13px;
    outline: none;
    flex-shrink: 0;
  }
  .role-select:focus {
    border-color: var(--accent);
  }
  .system-panel {
    border-left-color: #d29922;
    padding-top: 10px;
  }
  .panel-toggle {
    display: flex;
    align-items: baseline;
    gap: 8px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    outline: none;
  }
  .panel-toggle .panel-title {
    position: static;
    padding: 0;
    background: none;
    cursor: pointer;
  }
  .toggle-mark {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-3);
  }
  .system-body {
    display: flex;
    gap: 8px;
    padding: 8px 4px 2px;
  }
  .system-body .role-select {
    flex-shrink: 0;
  }
  .system-textarea {
    flex: 1;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 12px;
    color: var(--ink);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.4;
    outline: none;
    resize: vertical;
  }
  .system-textarea:focus {
    border-color: var(--accent);
  }
  .params-panel {
    border-left-color: var(--accent);
    max-height: none;
    padding-top: 12px;
  }
  .params-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 12px 10px;
  }
  .param-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .param-row-inline {
    align-items: center;
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
  .param-row input[type='checkbox'] {
    accent-color: var(--accent);
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
