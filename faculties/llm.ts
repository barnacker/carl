import type { Synapse } from '../synapse/index.js'
import type { LlmRequestEvent } from '../nervous-system.js'

export const LLM_VLLM_BASE = 'http://10.240.232.32:8000'

const DEFAULT_MODEL = 'Qwen/Qwen3.8-27B-FP8'

interface SseEventPayload {
  type?: string
  delta?: string
  item?: { type?: string }
  error?: { message?: string }
  response?: { usage?: SseUsage }
}

// vLLM /v1/responses `response.completed` usage — REAL field names observed
// live on the server (probe 2026-10-27, model Qwen3.8-27B-FP8):
//   usage.input_tokens            (prompt tokens)
//   usage.output_tokens           (completion tokens total)
//   usage.output_tokens_details.reasoning_tokens  (reasoning completion tokens)
//   usage.total_tokens
interface SseUsage {
  // vLLM emits OpenAI-standard names (prompt_tokens/completion_tokens); the
  // alternate spellings (input/output_tokens) are kept for other engines.
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  reasoning_tokens?: number
  output_tokens_details?: { reasoning_tokens?: number }
}

// Per-request telemetry self-accounting (the LLM faculty counts its own
// frames; nothing downstream counts for it). State machine:
//   'reasoning' from first reasoning frame until first content frame
//   'content'   from first content frame
//   'done'      when the stream closes
// Requests with thinking disabled skip straight to 'content' (zero-reasoning
// is a valid path), then 'done'.
// R1 (data round): telemetry is PUBLISHED ON EVERY TOKEN FRAME — no throttle.
interface RequestTelemetry {
  id: string
  state: 'reasoning' | 'content'
  reasoning_tokens: number
  content_tokens: number
  reasoning_frame: string | null // LATEST single reasoning token text (not an accumulation)
  content_frame: string | null // LATEST single content token text (not an accumulation)
  usage: { total_input_tokens: number; total_output_tokens: number; reasoning_tokens: number } | null
  started_at: string
  started_at_epoch_ms: number
  first_content_frame_at: number | null
  last_tick: number
  first_content_at: number | null
  last_tps: number | null
  firstContentScrubbed: boolean // terminal contract: scrub leading whitespace off the FIRST content frame of a request (once)
  done_issued: boolean
}

function tpsRound(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0
}

export class LLMFACULTY {
  private readonly synapse: Synapse
  private readonly controllers = new Map<string, AbortController>()
  private readonly telemetry = new Map<string, RequestTelemetry>()

  constructor(synapse: Synapse) {
    this.synapse = synapse
    synapse.subscribe('llm.request', async (event: unknown) => {
      await this.handleRequest(event as LlmRequestEvent)
    }, 'llm')
    synapse.subscribe('llm.abort', async (event: unknown) => {
      const { id } = event as { id: string }
      const controller = this.controllers.get(id)
      if (controller !== undefined) {
        controller.abort()
      }
    }, 'llm')
  }

  // The LLM faculty publishes its OWN terminal abort frame (a faculty
  // publishes its own telemetry — the README's own pattern). A killed round
  // must still publish a terminal llm.telemetry{status:'aborted'} (reviewer
  // leak #1: aborts were silent). It lands on the telemetry lane.
  private async publishAbortFrame(id: string): Promise<void> {
    const t = this.telemetry.get(id)
    await this.synapse.publish(
      {
        type: 'abort.frame',
        id,
        status: 'aborted',
        partial_content_tokens: t?.content_tokens,
        partial_reasoning_tokens: t?.reasoning_tokens,
      },
      'llm.abort.frame',
    )
  }

  private async handleRequest(req: LlmRequestEvent): Promise<void> {
    const { id } = req
    const controller = new AbortController()
    this.controllers.set(id, controller)
    // flag whether the abort-frame has been published (only once per request)
    let abortFramePublished = false
    try {
      await this.stream(req, controller)
    } catch (err) {
      const e = err as Error
      if (e.name === 'AbortError') {
        // Reviewer leak #1: a killed round must still publish a terminal
        // llm.telemetry{status:'aborted'} (the LLM faculty publishing its
        // OWN terminal telemetry frame; aborts were silent). The frame is
        // captured BEFORE the telemetry state is deleted below.
        abortFramePublished = true
        await this.publishAbortFrame(id)
      } else {
        void this.synapse.publish(
          {
            type: 'error',
            id,
            message: e.message,
          },
          'llm.error',
        )
      }
    } finally {
      this.controllers.delete(id)
      this.telemetry.delete(id)
    }
    void abortFramePublished
  }

  private async stream(req: LlmRequestEvent, controller: AbortController): Promise<void> {
    const { id, messages } = req
    let gotContent = false
    const now0 = Date.now()
    let tg = this.telemetry.get(id)
    if (tg === undefined) {
      tg = {
        id,
        state: 'reasoning',
        reasoning_tokens: 0,
        content_tokens: 0,
        reasoning_frame: null,
        content_frame: null,
        usage: null,
        started_at: new Date(now0).toISOString(),
        started_at_epoch_ms: now0,
        first_content_frame_at: null,
        last_tick: now0,
        first_content_at: null,
        last_tps: null,
        firstContentScrubbed: false,
        done_issued: false,
      }
      this.telemetry.set(id, tg)
    }

    const response = await fetch(`${LLM_VLLM_BASE}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: req.model !== undefined && req.model.length > 0 ? req.model : DEFAULT_MODEL,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        ...(req.temperature !== undefined && req.temperature > 0 ? { temperature: req.temperature } : {}),
        ...(req.top_p !== undefined && req.top_p > 0 ? { top_p: req.top_p } : {}),
        ...(req.max_tokens !== undefined && req.max_tokens > 0 ? { max_output_tokens: req.max_tokens } : {}),
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      void this.synapse.publish(
        {
          type: 'error',
          id,
          message: `HTTP ${response.status} ${text.slice(0, 500)}`.trim(),
        },
        'llm.error',
      )
      return
    }

    const body = response.body
    if (body === null) {
      void this.synapse.publish({ type: 'error', id, message: 'NO_CONTENT' }, 'llm.error')
      return
    }

    const decoder = new TextDecoder('utf8')
    let buffer = ''
    let sawCompleted = false

    const telemetryPayload = (
      t: RequestTelemetry,
      now: number,
      state: 'reasoning' | 'content' | 'done',
      tps: number | null,
    ): Record<string, unknown> => ({
      type: 'telemetry',
      id: t.id,
      state,
      reasoning_tokens: t.reasoning_tokens,
      content_tokens: t.content_tokens,
      reasoning_frame: t.reasoning_frame,
      content_frame: t.content_frame,
      // vLLM response.completed usage (real server field names, see SseUsage)
      // — present on the done frame (and any frame after completion is seen).
      ...(t.usage !== null
        ? {
            usage: {
              total_input_tokens: t.usage.total_input_tokens,
              total_output_tokens: t.usage.total_output_tokens,
              reasoning_tokens: t.usage.reasoning_tokens,
            },
          }
        : {}),
      content_tps: tps,
      started_at: t.started_at,
      last_tick_ms: now - (state === 'done' ? (t.first_content_at ?? now) : t.last_tick),
    })

    // R1: publish one llm.telemetry frame PER token frame (no throttle).
    // 'force' is no longer relevant except for done (guarded by done_issued).
    const publishTelemetry = (state?: 'reasoning' | 'content' | 'done'): void => {
      const t = this.telemetry.get(id)
      if (t === undefined) return
      const now = Date.now()
      const effState: 'reasoning' | 'content' | 'done' = state ?? t.state
      if (effState === 'done') {
        if (t.done_issued) return
        t.done_issued = true
        // Final: include content_tps (content tokens / elapsed since first content frame).
        const elapsed = t.first_content_at !== null ? now - t.first_content_at : 0
        const tps = t.content_tokens > 0 && elapsed > 0 ? tpsRound(t.content_tokens / (elapsed / 1000)) : null
        t.last_tps = tps
        void this.synapse.publish(telemetryPayload(t, now, 'done', tps), 'llm.telemetry')
        return
      }
      t.state = effState
      t.last_tick = now
      // Content tps while streaming (null before first content frame).
      let tps: number | null = t.last_tps
      if (effState === 'content' && t.first_content_at !== null && t.content_tokens > 0) {
        const ce = now - t.first_content_at
        tps = ce > 0 ? tpsRound(t.content_tokens / (ce / 1000)) : null
        t.last_tps = tps
      }
      void this.synapse.publish(telemetryPayload(t, now, effState, tps), 'llm.telemetry')
    }

    const processFrame = (frame: string): void => {
      for (const line of frame.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          if (!sawCompleted) {
            sawCompleted = true
            publishTelemetry('done')
            void this.synapse.publish({ type: 'done', id }, 'llm.done')
          }
          continue
        }
        let parsed: SseEventPayload
        try {
          parsed = JSON.parse(payload) as SseEventPayload
        } catch {
          continue
        }
        const type = parsed.type
        const t = this.telemetry.get(id)
        if (type === 'response.reasoning_text.delta' && typeof parsed.delta === 'string' && parsed.delta.length > 0) {
          gotContent = true
          if (t !== undefined && t.state === 'reasoning') {
            // No llm.reasoning.token type exists. Reasoning text has exactly one
            // address: the telemetry lane, inside llm.telemetry.reasoning_frame.
            t.reasoning_tokens += 1
            t.reasoning_frame = parsed.delta
            publishTelemetry('reasoning') // per-frame (R1): one telemetry frame per reasoning tick
          }
        } else if (type === 'response.output_text.delta' && typeof parsed.delta === 'string' && parsed.delta.length > 0) {
          gotContent = true
          // Terminal contract (locked 2026-10-27, xterm rebuild): the FIRST
          // content frame of a request must not lead with whitespace — the
          // model commonly emits "\n\nHello", and in a TERMINAL (not a chat
          // UI) a leading newline blanks the prompt line before the marker.
          // Scrub leading whitespace once per request; later frames touch the
          // model's real newlines verbatim (mid-/end-of-content \n stay).
          const tt = this.telemetry.get(id)
          let text = parsed.delta
          if (tt !== undefined && !tt.firstContentScrubbed) {
            tt.firstContentScrubbed = true
            const scrubbed = text.replace(/^[\s\u00a0]+/u, '')
            if (scrubbed.length === 0) continue // first frame was *only* whitespace: drop
            text = scrubbed
          }
          if (t !== undefined) {
            t.content_tokens += 1
            if (t.first_content_at === null) t.first_content_at = Date.now()
            if (t.first_content_frame_at === null) t.first_content_frame_at = Date.now()
            t.content_frame = text
            if (t.state === 'reasoning') {
              // zero-reasoning requests also land 'content' (state entry); reasoning stays 0.
              publishTelemetry('content') // state change reasoning -> content (per-frame from here)
            } else {
              publishTelemetry('content') // per-frame (R1): one telemetry frame per content tick
            }
          }
          void this.synapse.publish({ type: 'token', id, lane: 'content', text }, 'llm.content.token')
        } else if (type === 'response.completed') {
          // Capture vLLM usage (real field names — see SseUsage above) so the
          // done frame carries {usage: {total_input_tokens, total_output_tokens,
          // reasoning_tokens}}; the telemetry faculty profiles it per request.
          const usage = parsed.response?.usage
          if (t !== undefined && usage !== undefined) {
            // vLLM streams OpenAI-standard usage field names (proven on the
            // live engine: {prompt_tokens, total_tokens, completion_tokens});
            // the bare input_tokens/output_tokens spelling was never populated
            // by this deployment — every read fell through to 0 and the done
            // frame's usage went out as {0,0,0}, so the frame-tally
            // convergence check (DASH) could never see real numbers.
            const inTok = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens
              : typeof usage.input_tokens === 'number' ? usage.input_tokens : 0
            const outTok = typeof usage.completion_tokens === 'number' ? usage.completion_tokens
              : typeof usage.output_tokens === 'number' ? usage.output_tokens : 0
            const rTok = typeof usage.output_tokens_details?.reasoning_tokens === 'number' ? usage.output_tokens_details.reasoning_tokens
              : typeof usage.reasoning_tokens === 'number' ? usage.reasoning_tokens : 0
            t.usage = { total_input_tokens: inTok, total_output_tokens: outTok, reasoning_tokens: rTok }
          }
          sawCompleted = true
          publishTelemetry('done')
          void this.synapse.publish({ type: 'done', id }, 'llm.done')
        } else if (type !== undefined && type.startsWith('error')) {
          const msg = parsed.error?.message ?? 'stream error'
          if (!sawCompleted) {
            sawCompleted = true
            void this.synapse.publish({ type: 'error', id, message: msg }, 'llm.error')
          }
        }
      }
    }

    for await (const chunk of body) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk)
      let sepIdx: number
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sepIdx)
        buffer = buffer.slice(sepIdx + 2)
        processFrame(frame)
        if (sawCompleted) return
      }
    }
    // leftover frame after stream end (no trailing blank line)
    if (buffer.trim().length > 0 && !sawCompleted) {
      processFrame(buffer)
    }

    if (!sawCompleted) {
      if (gotContent) {
        publishTelemetry('done')
        void this.synapse.publish({ type: 'done', id }, 'llm.done')
      } else {
        void this.synapse.publish({ type: 'error', id, message: 'NO_CONTENT' }, 'llm.error')
      }
    }
  }
}
