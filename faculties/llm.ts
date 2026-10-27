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

export class LLMFACULTY {
  private readonly synapse: Synapse
  private readonly controllers = new Map<string, AbortController>()

  constructor(synapse: Synapse) {
    this.synapse = synapse
    synapse.subscribe('llm.request', async (event: unknown) => {
      await this.handleRequest(event as LlmRequestEvent)
    })
    synapse.subscribe('llm.abort', async (event: unknown) => {
      const { id } = event as { id: string }
      const controller = this.controllers.get(id)
      if (controller !== undefined) {
        controller.abort()
      }
    })
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
    }
  }

  private async stream(req: LlmRequestEvent, controller: AbortController): Promise<void> {
    const { id, messages } = req
    let gotContent = false

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

    const processFrame = (frame: string): void => {
      for (const line of frame.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          if (!sawCompleted) {
            sawCompleted = true
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
        if (type === 'response.reasoning_text.delta' && typeof parsed.delta === 'string' && parsed.delta.length > 0) {
          gotContent = true
          void this.synapse.publish({ type: 'token', id, lane: 'reasoning', text: parsed.delta }, 'llm.token')
        } else if (type === 'response.output_text.delta' && typeof parsed.delta === 'string' && parsed.delta.length > 0) {
          gotContent = true
          void this.synapse.publish({ type: 'token', id, lane: 'content', text: parsed.delta }, 'llm.token')
        } else if (type === 'response.completed') {
          sawCompleted = true
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
        void this.synapse.publish({ type: 'done', id }, 'llm.done')
      } else {
        void this.synapse.publish({ type: 'error', id, message: 'NO_CONTENT' }, 'llm.error')
      }
    }
  }
}
