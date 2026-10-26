export interface VllmModelConfig {
  baseUrl: string
  model: string
}

export const DEFAULT_VLLM_BASE_URL = 'http://10.240.232.32:8000'
export const DEFAULT_VLLM_MODEL = 'Qwen/Qwen3.8-27B-FP8'

// The vLLM endpoint is open: no auth of any kind. The client never sends an
// Authorization header, and no env var can add one.
export function resolveModelConfig(env: Record<string, string | undefined> = {}): VllmModelConfig {
  return {
    baseUrl: env.CARL_VLLM_BASE_URL || DEFAULT_VLLM_BASE_URL,
    model: env.CARL_VLLM_MODEL || DEFAULT_VLLM_MODEL,
  }
}

export interface VllmMessages {
  role: string
  content: string
}

export interface VllmParams {
  model?: string | undefined
  base_url?: string | undefined
  stream?: boolean | undefined
  temperature?: number | undefined
  top_p?: number | undefined
  max_tokens?: number | undefined
  stop?: string[] | string | undefined
  presence_penalty?: number | undefined
  frequency_penalty?: number | undefined
  seed?: number | undefined
  n?: number | undefined
}

export interface VllmChatOptions {
  /**
   * Live-stack pipe: called immediately as each SSE chunk carrying
   * choices[0].delta.content or choices[0].delta.reasoning arrives, in
   * arrival order. Absent (or throwing) callbacks must not affect the
   * resolved value.
   */
  onToken?: (tok: string, lane: 'reasoning' | 'content') => void
  /**
   * Per-request vLLM parameters from the UI. Each key present here is
   * forwarded into the request body; each key absent (null/undefined) is
   * omitted via the `!= null` spread guards in the body composition.
   */
  params?: VllmParams
}

export interface VllmModel {
  chat(messages: VllmMessages[], options?: VllmChatOptions): Promise<string>
}

async function collectStreamText(
  stream: AsyncIterable<unknown>,
  onToken?: (tok: string, lane: 'reasoning' | 'content') => void,
): Promise<string> {
  let fullText = ''
  let buffer = ''
  const decoder = new TextDecoder('utf8')
  for await (const raw of stream) {
    buffer += typeof raw === 'string' ? raw : decoder.decode(new Uint8Array(raw as Uint8Array))
    let sepIndex: number
    // SSE frames are separated by blank lines; split on \n\n (vLLM/OpenAI frames end in \n\n).
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)
      for (const line of frame.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          return fullText
        }
        let parsed: { choices?: ReadonlyArray<{ delta?: { content?: unknown; reasoning?: unknown } }> }
        try {
          parsed = JSON.parse(payload)
        } catch {
          continue
        }
        const delta = parsed.choices?.[0]?.delta
        // Live pipe: every token the model emits goes to the callback in
        // arrival order, tagged with its lane — answers (delta.content)
        // arrive as 'content', reasoning (delta.reasoning) as 'reasoning'.
        if (delta !== undefined) {
          for (const [key, piece] of [
            ['content', delta.content],
            ['reasoning', delta.reasoning],
          ] as const) {
            if (typeof piece === 'string' && piece.length > 0) {
              if (onToken !== undefined) onToken(piece, key)
              fullText += piece
            }
          }
        }
      }
    }
  }
  // Stream ended without an explicit [DONE] — settle with whatever accumulated.
  return fullText
}

export function createVllmModel(config: VllmModelConfig, fetchImpl: typeof fetch = fetch): VllmModel {
  return {
    async chat(messages, options: VllmChatOptions = {}) {
      // vLLM's OpenAI-compat chat endpoint is /v1/chat/completions (FastAPI); ${baseUrl} is the bare base, so append /v1/ here.
      // The endpoint is open — no Authorization header, ever.
      const baseOverride = options.params?.base_url?.trim()
      const endpoint = `${(baseOverride !== undefined && baseOverride.length > 0 ? baseOverride : config.baseUrl).replace(/\/+$/, '')}/v1/chat/completions`
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      }
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.params?.model || config.model,
          messages,
          stream: options.params?.stream ?? true,
          ...(options.params?.temperature   != null ? { temperature:  options.params.temperature   } : {}),
          ...(options.params?.top_p         != null ? { top_p:         options.params.top_p        } : {}),
          ...(options.params?.max_tokens    != null ? { max_tokens:    options.params.max_tokens    } : {}),
          ...(options.params?.stop          != null ? { stop:          options.params.stop         } : {}),
          ...(options.params?.presence_penalty    != null ? { presence_penalty:    options.params.presence_penalty    } : {}),
          ...(options.params?.frequency_penalty   != null ? { frequency_penalty:   options.params.frequency_penalty   } : {}),
          ...(options.params?.seed          != null ? { seed:          options.params.seed         } : {}),
          ...(options.params?.n             != null ? { n:             options.params.n            } : {}),
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`VLLM_HTTP_ERROR: HTTP ${response.status} ${text.slice(0, 500)}`)
      }
      const body = response.body
      if (body === null) {
        throw new Error('VLLM_BAD_RESPONSE: streamed response body is empty')
      }
      const content = await collectStreamText(body, options.onToken)
      if (content.length === 0) {
        throw new Error('VLLM_BAD_RESPONSE: streamed response had no delta.content or delta.reasoning')
      }
      return content
    },
  }
}
