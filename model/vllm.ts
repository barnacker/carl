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

export interface VllmChatOptions {
  /**
   * Live-stack pipe: called immediately as each SSE chunk carrying
   * choices[0].delta.content or choices[0].delta.reasoning arrives, in
   * arrival order. Absent (or throwing) callbacks must not affect the
   * resolved value.
   */
  onToken?: (tok: string) => void
}

export interface VllmModel {
  chat(messages: VllmMessages[], options?: VllmChatOptions): Promise<string>
}

async function collectStreamText(stream: AsyncIterable<unknown>, onToken?: (tok: string) => void): Promise<string> {
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
        // Live pipe: every token the model emits goes to the terminal in
        // arrival order — answers (delta.content) and reasoning
        // (delta.reasoning) both, and the resolved text is exactly what the
        // pipe showed.
        if (delta !== undefined) {
          for (const key of ['content', 'reasoning'] as const) {
            const piece = delta[key]
            if (typeof piece === 'string' && piece.length > 0) {
              if (onToken !== undefined) onToken(piece)
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
      const endpoint = `${config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      }
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
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
