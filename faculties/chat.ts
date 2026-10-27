import * as crypto from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Synapse } from '../synapse/index.js'
import type { ChatResponseEvent } from '../nervous-system.js'

interface ChatRequestBody {
  messages: ReadonlyArray<{ role: 'user' | 'system'; content: string }>
  model?: string
  temperature?: number
  top_p?: number
  max_tokens?: number
}

function parseHost(host: string | undefined): { host: string } | null {
  if (host === undefined || host === '') return null
  const raw = host.trim()
  if (raw.length === 0) return null
  const colon = raw.lastIndexOf(':')
  let h = raw
  if (colon !== -1 && /^\d+$/.test(raw.slice(colon + 1))) {
    h = raw.slice(0, colon)
  }
  if (h.length === 0) return null
  return { host: h }
}

export function isAllowedHost(host: string | undefined): boolean {
  const parsed = parseHost(host)
  if (parsed === null) return false
  return parsed.host === '127.0.0.1' || parsed.host === 'localhost' || parsed.host === 'hermes'
}

export class recreateChatFacade {
  private readonly synapse: Synapse
  private readonly activeResponses = new Map<string, ServerResponse>()

  constructor(synapse: Synapse) {
    this.synapse = synapse
    synapse.subscribe('chat.response', async (event: unknown) => {
      const payload = event as ChatResponseEvent
      const res = this.activeResponses.get(payload.id)
      if (res === undefined || res.writableEnded) return
      // SSE wire format (Spec §5): one JSON object per data: line.
      // All messages carry the type discriminator (token/done/error):
      //   data: {"type":"token","id":"<request_id>","lane":"content","text":"..."}
      //   data: {"type":"done","id":"<request_id>"}
      //   data: {"type":"error","id":"<request_id>","message":"..."}
      const data = JSON.stringify(payload)
      res.write(Buffer.from(`data: ${data}\n\n`, 'utf8'))
      if (payload.type === 'done' || payload.type === 'error') {
        res.end(Buffer.from('data: [DONE]\n\n', 'utf8'))
        this.activeResponses.delete(payload.id)
      }
    })
  }

  handleRequest(req: IncomingMessage, res: ServerResponse, body: string): void {
    const url = (req.url ?? '').split('?')[0]
    if (req.method !== 'POST' || url !== '/chat') return
    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
      return
    }
    let parsed: ChatRequestBody
    try {
      const json: unknown = JSON.parse(body)
      if (typeof json !== 'object' || json === null) throw new Error('bad body')
      const messages = (json as Record<string, unknown>).messages
      if (!Array.isArray(messages) || messages.length === 0) throw new Error('bad messages')
      for (const m of messages) {
        const mm = m as unknown as Record<string, unknown>
        if (mm.role !== 'user' && mm.role !== 'system') throw new Error('bad role')
        if (typeof mm.content !== 'string') throw new Error('bad content')
      }
      parsed = json as ChatRequestBody
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' }).end('{}')
      return
    }

    const id = crypto.randomUUID()
    void this.synapse.publish(
      {
        type: 'prompt',
        id,
        messages: parsed.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(parsed.model !== undefined ? { model: parsed.model } : {}),
        ...(parsed.temperature !== undefined ? { temperature: parsed.temperature } : {}),
        ...(parsed.top_p !== undefined ? { top_p: parsed.top_p } : {}),
        ...(parsed.max_tokens !== undefined ? { max_tokens: parsed.max_tokens } : {}),
      },
      'cortex.request',
    )

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    })
    res.flushHeaders()
    this.activeResponses.set(id, res)

    // res closes on (a) the terminal write above, or (b) the browser
    // disconnecting mid-stream. In case (b) the snapshot of the map
    // still holds this id, so we abort the LLM stream for it.
    res.on('close', () => {
      if (this.activeResponses.delete(id)) {
        void this.synapse.publish({ type: 'abort', id }, 'llm.abort')
      }
    })
  }
}
