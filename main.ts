import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve as pathResolve, sep } from 'node:path'
import { createServer, type Server } from 'node:http'

import { Bus, createSynapse, busFlowStats } from './nervous-system.js'
import { LLMFACULTY } from './faculties/llm.js'
import { recreateCortex } from './cortex.js'
import { recreateChatFacade } from './faculties/chat.js'
import { isAllowedHost } from './faculties/chat.js'
import { TelemetryFaculty } from './faculties/telemetry.js'

function parseHost(host: string | undefined): { host: string } | null {
  if (host === undefined || host === '') return null
  const raw = host.trim()
  if (raw.length === 0) return null
  const colon = raw.lastIndexOf(':')
  const h = colon !== -1 && /^\d+$/.test(raw.slice(colon + 1)) ? raw.slice(0, colon) : raw
  if (h.length === 0) return null
  return { host: h }
}

function hostOk(host: string | undefined): boolean {
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

function serveStatic(res: import('node:http').ServerResponse, dir: string, urlPath: string): void {
  if (urlPath.includes('..')) {
    res.writeHead(400).end()
    return
  }
  const full = pathResolve(dir, '.' + (urlPath === '/' || urlPath === '' ? '/200.html' : urlPath))
  if (!full.startsWith(dir)) {
    res.writeHead(403).end()
    return
  }
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

function bootstrap(): { server: Server; address: { port: number }; listen: () => Promise<number> } {
  // 1. Create the bus and wrap it in Synapse
  const bus = new Bus()
  const synapse = createSynapse(bus)

  // 2. LLM Faculty — subscribes in constructor
  const llm = new LLMFACULTY(synapse)

  // 3. Cortex — subscribes in constructor
  const cortex = new recreateCortex(synapse)

  // 4. Chat Faculty — subscribes in constructor
  const chat = new recreateChatFacade(synapse)

  // 4b. Telemetry Faculty — subscribes in constructor (telemetry lane + llm.*)
  //     and reads the bus's own flow counters (busFlowStats, delivery-at-publish).
  const telemetry = new TelemetryFaculty(synapse, busFlowStats)

  // 4c' The Nervous System observes ITS OWN flow: ns.telemetry @ 10 Hz on the
  //     telemetry lane (the permission map grants 'ns' on that lane for
  //     exactly this — read-only of itself; the dashboard consumes via the
  //     telemetry faculty, not as a direct subscriber).
  synapse.nsTelemetry(100)

  // 5. HTTP server on port 3000
  const staticDir = pathResolve(process.cwd(), 'web-ui', 'build')
  const server = createServer((req, res) => {
    void (async () => {
      const url = ((req.url ?? '').split('?')[0]) || '/'
      const hostOkNow = hostOk(req.headers.host)
      const method = req.method ?? 'GET'
      // Telemetry read-only API (GET) — its own group on :3000, same host
      // gate as /chat. Try it first: it returns true when it owns the path.
      if (telemetry.handleRequest(req, res, url)) {
        return
      }
      if (method === 'POST' && url === '/chat') {
        if (!hostOkNow) {
          res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
          return
        }
        let raw = ''
        req.on('data', (chunk: Buffer) => {
          raw += chunk
          if (raw.length > 1_000_000) req.destroy()
        })
        req.on('end', () => {
          chat.handleRequest(req, res, raw)
        })
        return
      }
      if (!hostOkNow) {
        res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
        return
      }
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'application/json' }).end('{}')
        return
      }
      serveStatic(res, staticDir, url)
    })()
  })

  return {
    server,
    address: { port: 3000 },
    listen: () =>
      new Promise<number>((done) => {
        server.listen(3000, '0.0.0.0', () => {
          const addr = server.address()
          const actual = typeof addr === 'object' && addr !== null ? addr.port : 3000
          console.log(`carl listening: http://127.0.0.1:${actual} (static=${staticDir})`)
          done(actual)
        })
      }),
  }
}

const { listen } = bootstrap()
listen().catch((err: Error) => {
  process.stderr.write(`carl: failed to start: ${err.message}\n`)
  process.exit(1)
})

export { bootstrap }
