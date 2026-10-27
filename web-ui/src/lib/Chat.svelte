<script lang="ts">
  import { onMount } from 'svelte';

  const DEFAULT_MODEL = 'Qwen/Qwen3.8-27B-FP8';

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
  let inputEl: HTMLTextAreaElement;

  // Visible, editable request parameters (everything sent to vLLM).
  let model = $state(DEFAULT_MODEL);
  let temperature = $state('1.0');
  let top_p = $state('1.0');
  let max_tokens = $state('');

  function scrollTerminal() {
    if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
  }

  function pushAssistantToken(lane: 'reasoning' | 'content', text: string) {
    if (lastFirstByte === null) lastFirstByte = Date.now();
    if (lampState === 'posting' && text.length > 0) lampState = 'receiving';
    streaming = true;
    if (text.length === 0) return;
    const last = history[history.length - 1];
    if (lane === 'reasoning') {
      last.reasoning += text;
    } else {
      last.content += text;
    }
    setTimeout(scrollTerminal, 0);
  }

  function markAssistantDone() {
    streamDone = true;
    if (lastLastByte === null) lastLastByte = Date.now();
    setTimeout(scrollTerminal, 0);
  }

  function focusInput() {
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      }
    }, 0);
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
      const messages: { role: 'user'; content: string }[] = [
        { role: 'user', content: text },
      ];

      const body: Record<string, unknown> = {
        model,
        messages,
      };
      const t = parseFloat(temperature);
      if (!Number.isNaN(t) && t > 0) body.temperature = t;
      const tp = parseFloat(top_p);
      if (!Number.isNaN(tp) && tp > 0) body.top_p = tp;
      const mt = parseInt(max_tokens, 10);
      if (!Number.isNaN(mt) && mt > 0) body.max_tokens = mt;

      const res = await fetch('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf8');
      let buf = '';

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
            let parsed: { type?: string; lane?: 'reasoning' | 'content'; text?: string; message?: string } | null = null;
            try {
              parsed = JSON.parse(payload) as typeof parsed;
            } catch {
              parsed = null;
            }
            if (
              parsed &&
              parsed.type === 'token' &&
              (parsed.lane === 'reasoning' || parsed.lane === 'content') &&
              typeof parsed.text === 'string'
            ) {
              pushAssistantToken(parsed.lane, parsed.text);
            }
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
    <div class="term-history" bind:this={terminalEl} aria-live="polite"></div>
    <div class="term-prompt-row">
      <textarea
        bind:this={inputEl}
        bind:value={input}
        rows="1"
        autocomplete="off"
        spellcheck="false"
        placeholder=""
        disabled={sending}
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          } else if (e.key === 'Enter' && e.shiftKey) {
            // let the native newline flow
          }
        }}
        oninput={() => {
          // caret placement on every input
          if (inputEl) {
            inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
          }
        }}
      ></textarea>
    </div>
  </div>
  <div class="params">
    <label class="param-row">
      <span class="param-label">model</span>
      <input class="param-input" bind:value={model} type="text" autocomplete="off" />
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
  .term-prompt-row {
    flex-shrink: 0;
  }
  .term-prompt-row textarea {
    width: 100%;
    background: #000;
    border: none;
    color: #00ff41;
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.25;
    resize: none;
    outline: none;
    caret-color: #00ff41;
  }
  .term-prompt-row textarea:disabled {
    opacity: 0.5;
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
  .param-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 4px;
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
