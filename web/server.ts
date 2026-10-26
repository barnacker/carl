import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve as pathResolve } from 'node:path'

import { createServer, type Server } from 'node:http'

import { createVllmModel, resolveModelConfig, type VllmMessages } from '../model/vllm.js'

/**
 * Harness SSE endpoint + static SvelteKit build (CARL web UI v1).
 *
 * The browser talks ONLY to the harness (one origin). The harness relays to
 * vLLM and back: each token the model emits (delta.content and delta.reasoning,
 * in arrival order) is forwarded to the browser as an SSE `data:` line the
 * moment it arrives. No buffering — the wire IS the stream.
 *
 * Endpoints:
 *   POST /v1/chat          SSE relay to vLLM (stream:true, per-token frames)
 *   GET  /*                static serving of the SvelteKit `build/` dir
 *
 * Host allowlist (same-origin trust scope for this internal box):
 *   127.0.0.1[:PORT], localhost[:PORT], hermes[:PORT]
 *
 * SSE wire format:
 *   status:  200, content-type: text/event-stream, cache-control: no-cache,
 *            x-accel-buffering: no
 *   frame:   `data: <token>\n\n` per token (a token string, no JSON), then
 *            `data: [DONE]\n\n` on completion.
 *   error:   `data: <error message>\n\n` followed by `data: [DONE]\n\n`.
 *
 * The server logs one line per request with the first/last SSE write
 * timestamps and total bytes — that log IS the live-streaming proof.
 */

export interface ChatRequest {
  model?: string
  base_url?: string
  messages: VllmMessages[]
  stream?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  stop?: string[] | string
  presence_penalty?: number
  frequency_penalty?: number
  seed?: number
  n?: number
}

export interface WebServer {
  server: Server
  address: { port: number }
  listen: () => Promise<number>
}

function parseHost(host: string | undefined): { host: string; port: number } | null {
  if (host === undefined) return null
  const raw = host.trim()
  if (raw.length === 0) return null
  let h = raw
  let port = 80
  const colon = raw.lastIndexOf(':')
  if (colon !== -1 && /^\d+$/.test(raw.slice(colon + 1))) {
    h = raw.slice(0, colon)
    port = Number(raw.slice(colon + 1))
  }
  if (h.length === 0) return null
  return { host: h, port }
}

export function isAllowedHost(host: string | undefined): boolean {
  const parsed = parseHost(host)
  if (parsed === null) return false
  return parsed.host === '127.0.0.1' || parsed.host === 'localhost' || parsed.host === 'hermes'
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function serveStatic(res: import('node:http').ServerResponse, dir: string, urlPath: string) {
  if (urlPath.includes('..')) {
    res.writeHead(400).end()
    return
  }
  const candidate = urlPath === '/' || urlPath === '' ? '/200.html' : urlPath
  const full = pathResolve(dir, '.' + candidate)
  if (!full.startsWith(dir)) {
    res.writeHead(403).end()
    return
  }
  // Real files ship with their extension. SPA routes (no extension) and the
  // root fall back to 200.html — that's how adapter-static SPA mode works.
  let target = full
  const hasExt = extname(full).length > 0
  if (!existsSync(target) && (!hasExt || urlPath === '/')) {
    target = pathResolve(dir, '200.html')
    if (!target.startsWith(dir)) {
      res.writeHead(403).end()
      return
    }
    if (!existsSync(target)) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{}')
      return
    }
  }
  if (!existsSync(target)) {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{}')
    return
  }
  const data = readFileSync(target)
  const type = MIME[extname(target)] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': type, 'content-length': data.byteLength })
  res.end(data)
}

export function createWebServer(options: {
  port?: number
  staticDir?: string
  modelConfig?: ReturnType<typeof resolveModelConfig>
  log?: (line: string) => void
}): WebServer {
  const port = options.port ?? 3000
  const staticDir = options.staticDir ?? pathResolve(process.cwd(), 'web-ui', 'build')
  const log =
    options.log ??
    ((line: string) => {
      if (!process.stdout.destroyed) process.stdout.write(line + '\n')
    })
  const modelConfig = options.modelConfig ?? resolveModelConfig(process.env)
  const { chat } = createVllmModel(modelConfig)

  const server = createServer((req, res) => {
    const url = ((req.url ?? '').split('?')[0] as string) || '/'
    const hostOk = isAllowedHost(req.headers.host)
    if (req.method === 'POST' && url === '/v1/chat') {
      if (!hostOk) {
        res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
        return
      }

      let raw = ''
      req.on('data', (chunk: Buffer) => {
        raw += chunk
        if (raw.length > 1_000_000) req.destroy()
      })
      req.on('end', () => {
        let parsed: ChatRequest
        try {
          const json: unknown = JSON.parse(raw)
          parsed = json as ChatRequest
          const messages = parsed.messages
          if (!Array.isArray(messages) || messages.length === 0) throw new Error('bad messages')
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' }).end('{}')
          return
        }

        const writes: Array<{ at: number; bytes: number }> = []
        let closed = false
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-accel-buffering': 'no',
        })
        res.flushHeaders()

        const send = (data: string, lane: 'reasoning' | 'content') => {
          if (closed) return
          const buf = Buffer.from(`data: ${JSON.stringify({ lane, tok: data })}\n\n`, 'utf8')
          writes.push({ at: Date.now(), bytes: buf.length })
          res.write(buf)
        }
        const end = () => {
          if (closed) return
          closed = true
          res.end()
        }

        log(
          `web-ui request: ${parsed.messages.length} message(s), model=${
            parsed.model ?? modelConfig.model
          }, t0=${new Date().toISOString()}`,
        )

        chat(parsed.messages, {
          onToken: (tok, lane) => send(tok, lane),
          params: {
            model: parsed.model,
            base_url: parsed.base_url,
            stream: parsed.stream,
            temperature: parsed.temperature,
            top_p: parsed.top_p,
            max_tokens: parsed.max_tokens,
            stop: parsed.stop,
            presence_penalty: parsed.presence_penalty,
            frequency_penalty: parsed.frequency_penalty,
            seed: parsed.seed,
            n: parsed.n,
          },
        })
          .then(() => {
            const buf = Buffer.from('data: [DONE]\n\n', 'utf8')
            writes.push({ at: Date.now(), bytes: buf.length })
            res.write(buf)
            end()
            const first = writes.length > 0 ? (writes[0] as { at: number }).at : 0
            const last = writes.length > 0 ? (writes[writes.length - 1] as { at: number }).at : 0
            const total = writes.reduce((n, w) => n + w.bytes, 0)
            log(
              `web-ui stream done: firstByte=${new Date(first).toISOString()} lastByte=${new Date(last).toISOString()} span_ms=${last - first} bytes=${total}`,
            )
          })
          .catch((err: Error) => {
            log(`web-ui stream error: ${err.message}`)
            const errBuf = Buffer.from(`data: ${err.message}\n\n`, 'utf8')
            writes.push({ at: Date.now(), bytes: errBuf.length })
            res.write(errBuf)
            const doneBuf = Buffer.from('data: [DONE]\n\n', 'utf8')
            writes.push({ at: Date.now(), bytes: doneBuf.length })
            res.write(doneBuf)
            end()
          })

        res.on('close', () => {
          closed = true
        })
      })
      return
    }

    // static fallback — requires Host allowlist too (same-origin trust scope)
    if (!hostOk) {
      res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'application/json' }).end('{}')
      return
    }
    serveStatic(res, staticDir, url)
  })

  return {
    server,
    address: { port },
    listen: () =>
      new Promise<number>((done) => {
        server.listen(port, () => {
          const addr = server.address()
          const actual = typeof addr === 'object' && addr !== null ? addr.port : port
          log(`web-ui listening: http://127.0.0.1:${actual} (static=${staticDir})`)
          done(actual)
        })
      }),
  }
}
