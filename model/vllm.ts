export interface VllmModelConfig {
  baseUrl: string
  model: string
  apiKey?: string
  noAuth?: boolean
}

export const DEFAULT_VLLM_BASE_URL = 'http://10.240.232.32:8000'
export const DEFAULT_VLLM_MODEL = 'Qwen/Qwen3.8-27B-FP8'

export function resolveModelConfig(env: Record<string, string | undefined> = {}): VllmModelConfig {
  const apiKey = (env.CARL_VLLM_API_KEY ?? env.OPENAI_API_KEY) || undefined
  const noAuth = env.CARL_VLLM_NO_AUTH === '1'
  return {
    baseUrl: env.CARL_VLLM_BASE_URL || DEFAULT_VLLM_BASE_URL,
    model: env.CARL_VLLM_MODEL || DEFAULT_VLLM_MODEL,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(noAuth ? { noAuth: true } : {}),
  }
}

export interface VllmMessages {
  role: string
  content: string
}

export interface VllmModel {
  chat(messages: VllmMessages[]): Promise<string>
}

export function createVllmModel(config: VllmModelConfig, fetchImpl: typeof fetch = fetch): VllmModel {
  return {
    async chat(messages) {
      if (config.apiKey === undefined || config.apiKey === '') {
        if (config.noAuth !== true) {
          throw new Error(
            'VLLM_NO_API_KEY: provide CARL_VLLM_API_KEY or OPENAI_API_KEY, or set CARL_VLLM_NO_AUTH=1 for a keyless local vLLM',
          )
        }
      }

      // vLLM's OpenAI-compat chat endpoint is /v1/chat/completions (FastAPI); ${baseUrl} is the bare base, so append /v1/ here.
      const endpoint = `${config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      }
      if (config.apiKey !== undefined && config.apiKey !== '') {
        headers.authorization = `Bearer ${config.apiKey}`
      }
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`VLLM_HTTP_ERROR: HTTP ${response.status} ${text.slice(0, 500)}`)
      }

      const json = await response.json()
      const content = json?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('VLLM_BAD_RESPONSE: missing choices[0].message.content')
      }
      return content
    },
  }
}
