<script lang="ts">
  import { onMount } from 'svelte';

  // Default values for the visible, editable parameter fields below — not
  // wire constants: every byte sent to vLLM comes from a field on this page.
  const DEFAULT_MODEL = 'Qwen/Qwen3.8-27B-FP8';
  const DEFAULT_SYSTEM_PROMPT = 'You are the response faculty for CARL. Respond concisely.';

  type Role = 'system' | 'user' | 'assistant';

  type Entry = { user: string; reasoning: string; content: string };

  let history = $state<Entry[]>([]);
  let input = $state('');
  let sending = $state(false);
  let streaming = $state(false);
  let streamDone = $state(false);
  let lampState = $state<'idle' | 'posting' | 'receiving'>('idle');
  let controller: AbortController | null = null;
  let lastFirstByte: number | null = $state(null);
  let lastLastByte: number | null = $state(null);
  let terminalEl: HTMLDivElement;
  let inputEl: HTMLInputElement;

  // Visible, editable request parameters (everything sent to vLLM).
  const DEFAULT_BASE_URL = 'http://10.240.232.32:8000';
  let baseUrl = $state(DEFAULT_BASE_URL);
  let model = $state(DEFAULT_MODEL);
  let systemRole = $state<Role>('system');
  let systemText = $state(DEFAULT_SYSTEM_PROMPT);
  let userRole = $state<Role>('user');
  let stream = $state(true);
  let temperature = $state('1.0');
  let top_p = $state('1.0');
  let max_tokens = $state('');
  let stop = $state('');
  let presence_penalty = $state('0.0');
  let frequency_penalty = $state('0.0');
  let seed = $state('');
  let n = $state('');

  function scrollTerminal() {
    if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
  }

  function formatTs(ms: number | null) {
    return ms === null ? '—' : new Date(ms).toISOString().split('T')[1];
  }

  function pushAssistantToken(lane: 'reasoning' | 'content', tok: string) {
    if (lastFirstByte === null) lastFirstByte = Date.now();
    if (lampState === 'posting' && tok.length > 0) lampState = 'receiving';
    streaming = true;
    if (tok.length === 0) return;
    const last = history[history.length - 1];
    if (lane === 'reasoning') {
      last.reasoning += tok;
    } else {
      last.content += tok;
    }
    setTimeout(scrollTerminal, 0);
  }

  function markAssistantDone() {
    streamDone = true;
    if (lastLastByte === null) lastLastByte = Date.now();
    setTimeout(scrollTerminal, 0);
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
    streamDone = false;
    history.push({ user: text, reasoning: '', content: '' });
    scrollTerminal();

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
      setTimeout(scrollTerminal, 0);
      focusInput();
    }
  }

  function abortStream() {
    controller?.abort();
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
    <div class="term-history" bind:this={terminalEl}>
      {#each history as entry}
        <pre class="term-entry-user">▸ {entry.user}</pre>
        {#if entry.reasoning}
          <pre class="term-entry-reasoning">{entry.reasoning}</pre>
        {/if}
        {#if entry.content}
          <pre class="term-entry-content">{entry.content}</pre>
        {/if}
        <div class="term-entry-done"></div>
      {/each}
      {#if !streamDone && streaming}
        <pre class="term-entry-user">▸ {input}</pre>
      {/if}
    </div>
    <div class="term-prompt-row">
      <span class="term-caret">▸</span>
      <input
        bind:this={inputEl}
        bind:value={input}
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder=""
        disabled={sending}
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
      />
    </div>
    <div class="term-role-row">
      <select class="term-role-select" bind:value={userRole} aria-label="user message role">
        <option value="user">user</option>
        <option value="system">system</option>
        <option value="assistant">assistant</option>
      </select>
    </div>
    <div class="term-buttons">
      {#if sending}
        <button class="stop" onclick={abortStream}>Stop</button>
      {:else}
        <button class="send" onclick={() => send()} disabled={input.trim().length === 0}>Send</button>
      {/if}
    </div>
  </div>
  <div class="params">
    <label class="param-row">
      <span class="param-label">base_url</span>
      <input class="param-input" bind:value={baseUrl} type="text" autocomplete="off" spellcheck="false" placeholder="vLLM endpoint (empty → server default)" />
    </label>
    <label class="param-row">
      <span class="param-label">model</span>
      <input class="param-input" bind:value={model} type="text" autocomplete="off" />
    </label>
    <span class="sub-header">SYSTEM</span>
    <label class="param-row">
      <span class="param-label">role</span>
      <select class="param-select" bind:value={systemRole} aria-label="system message role">
        <option value="system">system</option>
        <option value="user">user</option>
        <option value="assistant">assistant</option>
      </select>
    </label>
    <label class="param-row">
      <span class="param-label">prompt</span>
      <textarea
        class="param-textarea"
        bind:value={systemText}
        rows="3"
        placeholder="(empty — no system message sent)"
      ></textarea>
    </label>
    <span class="sub-header">SAMPLING</span>
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
      <span class="param-label">presence_pen</span>
      <input class="param-input" bind:value={presence_penalty} type="number" step="0.1" />
    </label>
    <label class="param-row">
      <span class="param-label">frequency_pen</span>
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
    <label class="param-row param-row-inline">
      <span class="param-label">stream</span>
      <input type="checkbox" bind:checked={stream} />
    </label>
    <p class="wire-line">
      <span class="param-label">wire</span>
      content-type: application/json · accept: text/event-stream · auth: none
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
    border-left: 2px solid #00ff41;
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
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 16px 8px 8px;
  }
  .term-entry-user {
    color: #00ff41;
    font-family: var(--mono);
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    pointer-events: none;
    user-select: text;
  }
  .term-entry-reasoning {
    color: #00cc33;
    font-family: var(--mono);
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    padding-left: 2ch;
    pointer-events: none;
    user-select: text;
  }
  .term-entry-content {
    color: #00ff41;
    font-family: var(--mono);
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    pointer-events: none;
    user-select: text;
  }
  .term-entry-done {
    height: 8px;
  }
  .term-prompt-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex-shrink: 0;
  }
  .term-caret {
    color: #00ff41;
    font-family: var(--mono);
    font-size: 14px;
    flex-shrink: 0;
  }
  .term-prompt-row input {
    flex: 1;
    background: #000;
    border: none;
    border-bottom: 1px solid #00ff41;
    padding: 4px 0;
    color: #00ff41;
    font-family: var(--mono);
    font-size: 14px;
    outline: none;
  }
  .term-prompt-row input:disabled {
    opacity: 0.5;
  }
  .term-role-row {
    flex-shrink: 0;
    padding: 2px 0;
  }
  .term-role-select {
    background: #000;
    border: 1px solid #00ff41;
    border-radius: 4px;
    padding: 2px 6px;
    color: #00ff41;
    font-family: var(--mono);
    font-size: 12px;
    outline: none;
  }
  .term-role-select:focus {
    border-color: #00cc33;
  }
  .term-buttons {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .send,
  .stop {
    padding: 2px 12px;
    border-radius: 4px;
    border: 1px solid #00ff41;
    background: transparent;
    color: #00ff41;
    font-weight: 600;
    font-size: 11px;
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
  .sub-header {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 6px 0 2px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 4px;
  }
  .param-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 4px;
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
  .param-select {
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
  .param-select:focus {
    border-color: var(--accent);
  }
  .param-textarea {
    flex: 1;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--ink);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.4;
    outline: none;
    resize: vertical;
  }
  .param-textarea:focus {
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
