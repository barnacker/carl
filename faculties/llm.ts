import type { Synapse } from '../synapse/index.js'
import type { LlmRequestEvent } from '../nervous-system.js'

export const LLM_VLLM_BASE = 'http://10.240.232.32:8000'

const DEFAULT_MODEL = 'Qwen/Qwen3.8-27B-FP8'

interface SseEventPayload {
  type?: string
  delta?: string
  item?: { type?: string }
  error?: { message?: string }
}

const TELEMETRY_THROTTLE_MS = 500

// Per-request telemetry self-accounting (the LLM faculty counts its own
// frames; nothing downstream counts for it). State machine:
//   'reasoning' from first reasoning frame until first content frame
//   'content'   from first content frame
//   'done'      when the stream closes
// Requests with thinking disabled skip straight to 'content' (zero-reasoning
// is a valid path), then 'done'.
interface RequestTelemetry {
  id: string
  state: 'reasoning' | 'content'
  reasoning_tokens: number
  content_tokens: number
  reasoning_frame: string | null // LATEST single reasoning token text (not an accumulation)
  started_at: string
  last_tick: number
  first_content_at: number | null
  last_tps: number | null
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

  private async handleRequest(req: LlmRequestEvent): Promise<void> {
    const { id } = req
    const controller = new AbortController()
    this.controllers.set(id, controller)
    try {
      await this.stream(req, controller)
    } catch (err) {
      const e = err as Error
      if (e.name !== 'AbortError') {
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
  }

  private async stream(req: LlmRequestEvent, controller: AbortController): Promise<void> {
    const { id, messages } = req
    let gotContent = false
    let tg = this.telemetry.get(id)
    if (tg === undefined) {
      tg = {
        id,
        state: 'reasoning',
        reasoning_tokens: 0,
        content_tokens: 0,
        reasoning_frame: null,
        started_at: new Date().toISOString(),
        last_tick: Date.now(),
        first_content_at: null,
        last_tps: null,
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

    const publishTelemetry = (state?: 'reasoning' | 'content' | 'done', force?: boolean): void => {
      const t = this.telemetry.get(id)
      if (t === undefined) return
      const now = Date.now()
      const effState: 'reasoning' | 'content' | 'done' = state ?? t.state
      if (effState === 'done') {
        // Final: include content_tps (content tokens / elapsed since first content frame).
        const elapsed = t.first_content_at !== null ? now - t.first_content_at : 0
        const tps = t.content_tokens > 0 && elapsed > 0 ? tpsRound(t.content_tokens / (elapsed / 1000)) : null
        t.last_tps = tps
        void this.synapse.publish(
          {
            type: 'telemetry',
            id,
            state: 'done',
            reasoning_tokens: t.reasoning_tokens,
            content_tokens: t.content_tokens,
            reasoning_frame: t.reasoning_frame,
            content_tps: tps,
            started_at: t.started_at,
            last_tick_ms: now - t.last_tick,
          },
          'llm.telemetry',
        )
        return
      }
      // Live tick: first frame for a state, or a tick >= 500ms since the last.
      const isStateEntry = state !== undefined && t.state !== effState
      const elapsed = now - t.last_tick
      if (!force && !isStateEntry && elapsed < TELEMETRY_THROTTLE_MS) return
      t.state = effState
      t.last_tick = now
      // Content tps while streaming (null before first content frame).
      let tps: number | null = t.last_tps
      if (effState === 'content' && t.first_content_at !== null && t.content_tokens > 0) {
        const ce = now - t.first_content_at
        tps = ce > 0 ? tpsRound(t.content_tokens / (ce / 1000)) : null
        t.last_tps = tps
      }
      void this.synapse.publish(
        {
          type: 'telemetry',
          id,
          state: effState,
          reasoning_tokens: t.reasoning_tokens,
          content_tokens: t.content_tokens,
          reasoning_frame: t.reasoning_frame,
          content_tps: tps,
          started_at: t.started_at,
          last_tick_ms: now - t.last_tick,
        },
        'llm.telemetry',
      )
    }

    const processFrame = (frame: string): void => {
      for (const line of frame.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          if (!sawCompleted) {
            sawCompleted = true
            publishTelemetry('done', true)
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
            publishTelemetry('reasoning', true) // publish on the first reasoning frame (state entry)
          }
          // publishTelemetry throttles subsequent reasoning frames to ~500ms.
        } else if (type === 'response.output_text.delta' && typeof parsed.delta === 'string' && parsed.delta.length > 0) {
          gotContent = true
          if (t !== undefined) {
            t.content_tokens += 1
            if (t.first_content_at === null) t.first_content_at = Date.now()
            if (t.state === 'reasoning') {
              // zero-reasoning requests also land 'content' (state entry); reasoning stays 0.
              publishTelemetry('content', true) // state change reasoning -> content
            } else {
              publishTelemetry('content') // throttled content tick (~500ms)
            }
          }
          void this.synapse.publish({ type: 'token', id, lane: 'content', text: parsed.delta }, 'llm.content.token')
        } else if (type === 'response.completed') {
          sawCompleted = true
          publishTelemetry('done', true)
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
        publishTelemetry('done', true)
        void this.synapse.publish({ type: 'done', id }, 'llm.done')
      } else {
        void this.synapse.publish({ type: 'error', id, message: 'NO_CONTENT' }, 'llm.error')
      }
    }
  }
}
