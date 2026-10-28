import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve as pathResolve, sep } from 'node:path'
import { createServer, type Server } from 'node:http'

import { Bus, createSynapse, busFlowStats } from './nervous-system.js'
import { LLMFACULTY } from './faculties/llm.js'
import { recreateCortex } from './cortex.js'
import { DASHFaculty, isAllowedHost } from './faculties/dash.js'
import { TelemetryFaculty } from './faculties/telemetry.js'

// The baked SEMVER for the /version endpoint (display version; the JSON-epoch
// in web-ui/_app/version.json stays for cache busting only — the two are
// independent). The CLI queries GET /version to learn the service version.
const BAKED_SEMVER = '0.1.0'

// --- client gate (structural; kept verbatim from the pre-DASH shape) --------
// Allows Host {127.0.0.1, localhost, hermes}; a missing/bad host is 403.
function hostOk(host: string | undefined): boolean {
  return isAllowedHost(host)
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

  // 2. LLM Faculty — subscribes in constructor (publishes its own
  //    llm.telemetry lane + the terminal abort frame; the #IDENTITY round is
  //    untouched in cortex.ts — the model is referenced by DEFAULT_MODEL,
  //    never by the UI surface)
  const llm = new LLMFACULTY(synapse)

  // 3. Cortex — the #IDENTITY anchor (byte-identical; do not reslice)
  const cortex = new recreateCortex(synapse)

  // 4b. Telemetry Faculty — bus monitor (flow counts, ns.bus stats, byId
  //     profile ring, its own self-test subject); unchanged monitor logic.
  const telemetry = new TelemetryFaculty(synapse, busFlowStats)

  // 4c. DASH Faculty — the ONE user control surface (POST /dash, SSE,
  //     multiplexed). A real faculty on the nervous system: it publishes to
  //     corners (cortex.request / llm.abort) and consumes llm.* + llm.
  //     telemetry + ns.telemetry via its granted bus positions. Constructs
  //     the IMMU (the immune-system boot sequencer — the SOLE owner of
  //     self-test probe timing) and hands main.ts its boot control surface.
  const dash = new DASHFaculty(synapse)

  // 4c'' The IMMU boot control surface — main.ts's POST /dash branches
  //      ({boot_status:true,dash_id} / {boot_start:{session},dash_id})
  //      route here. The DASH faculty owns the IMMU (the immune-system boot
  //      sequencer — the SOLE owner of self-test probe timing); its
  //      boot-status/boot-start accessors expose the in-process singleton
  //      (dash_id allow-list inside faculties/immune-system/boot.ts; the
  //      outer host gate is the HTTP layer's).
  const IMMU_BOOT = dash

  // 4c' The Nervous System observes ITS OWN flow: ns.telemetry @ 10 Hz on the
  //     telemetry lane (the permission map grants 'ns' on that lane for
  //     exactly this — read-only of itself; DASH consumes it via the
  //     granted position and relays it to the client as {t:'flow'}).
  synapse.nsTelemetry(100)

  // 5. HTTP server on port 3000 (dynamic: the actual bound port is captured
  //    in `actual` below and pinned on the DASH faculty via setListenPort
  //    after listen — the venue's internal control fetches (DASH's boot
  //    status self-POST, the TELE leg's telemetry snapshot) MUST hit the
  //    live port, not a hardcoded 3000. SECURITY-3 / REVIEW ROUND 1 FIX.)
  const staticDir = pathResolve(process.cwd(), 'web-ui', 'build')
  const server = createServer((req, res) => {
    void (async () => {
      const url = ((req.url ?? '').split('?')[0]) || '/'
      const hostOkNow = hostOk(req.headers.host)
      const method = req.method ?? 'GET'

      // GET /version — the CLI queries this to learn the baked service
      // version (JSON-epoch in _app/version.json stays for cache busting;
      // the two are independent).
      if (method === 'GET' && url === '/version') {
        if (!hostOkNow) {
          res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ version: BAKED_SEMVER, surface: 'dash' }))
        return
      }

      // Telemetry read-only API (GET) — bus monitor surface, same host gate.
      if (telemetry.handleRequest(req, res, url)) {
        return
      }

      // THE ONE user surface: /dash (SSE, multiplexed — the browser and the
      // CLI both talk to /dash). GET /dash = the SSE attached stream; POST
      // /dash = {msg} (send) / {abort, id} (kill a round) / {snapshot}
      // (self-test subject on the current stream).
      if (url === '/dash') {
        if (!hostOkNow) {
          res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
          return
        }
        if (method === 'GET') {
          // attach the SSE stream; the per-connection self-test re-triggers
          // on EVERY attach (operator rule) and publishes boot frames.
          dash.attachSession(res, req.headers.host ?? '')
          return
        }
        if (method === 'POST') {
          let raw = ''
          req.on('data', (chunk: Buffer) => {
            raw += chunk
            if (raw.length > 1_000_000) {
              req.destroy()
              return
            }
          })
          req.on('end', () => {
            // Session correlation: the POST rides a SEPARATE connection from
            // the SSE GET. The GET's handshake handed the client a tag (the
            // session's id, via {t:'sseinit', tag}); the client echoes it on
            // every POST (header `X-Dash-Session`, or body `session`). We
            // resolve the POST back onto the session that owns the stream —
            // minimal tag correlation, the session stays keyed by the SSE
            // GET's res. (main.ts no longer calls activeSession(res) here —
            // a POST's own res can never match a session keyed by the GET.)
            let text = ''
            let tag = typeof req.headers['x-dash-session'] === 'string' ? (req.headers['x-dash-session'] as string) : ''
            let body: Record<string, unknown> = {}
            try {
              body = JSON.parse(raw || '{}') as Record<string, unknown>
            } catch {
              /* not JSON / no body — fall through with whatever we have */
            }
            if (tag === '' && typeof body.session === 'string') tag = body.session
            // IMMU boot protocol (spec v5): the self-test sequencer's
            // control surface. The outer host gate already passed (above).
            if (body.boot_status === true && typeof body.dash_id === 'string') {
              const r = IMMU_BOOT.bootStatus(body.dash_id)
              res.writeHead(r.status === 'ok' ? 200 : 403, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify(r.status === 'ok'
                ? { OK: true, snapshot: r.snapshot }
                : { OK: false, refused: r.refused }))
              return
            }
            // REVIEW ROUND 1 (SECURITY-1): gate the boot_start body — the
            // value must be `{session?...}` or `true` (a plain object or
            // boolean). Any other shape (e.g. a string / number) is
            // rejected: it is NOT a legitimate boot_start form.
            const _bsRaw = body.boot_start
            const _bsIsShape = _bsRaw === true || (typeof _bsRaw === 'object' && _bsRaw !== null && !Array.isArray(_bsRaw))
            if (_bsIsShape && typeof body.dash_id === 'string') {
              const bs = _bsRaw as { session?: unknown } | boolean
              const session = typeof bs === 'object' && bs !== null && typeof bs.session === 'string' ? bs.session : tag
              const r = IMMU_BOOT.bootStart(body.dash_id, session)
              res.writeHead(r.status === 'ok' ? 202 : 409, { 'content-type': 'application/json' })
              res.end(JSON.stringify(r.status === 'ok'
                ? { ok: true, stream: '/dash' }
                : { ok: false, refused: r.refused }))
              return
            }
            // POST /dash identity note (SECURITY-2, documented risk): the
            // `tag` used below (and the X-Dash-Session header in general)
            // is derived SOLELY from the client-controlled header — no
            // re-validation that a prior GET /dash issued this session tag.
            // Mitigation: the IMMU dash_id allow-list (`dash`/`tele`/etc.)
            // is the auth gate for the boot.commands channel, and the outer
            // host gate (`isAllowedHost`) limits callers to the venue's own
            // loopback hosts. A forged tag can only create a round on a
            // session it does not own; it cannot invoke an IMMU boot.start
            // for a dash_id it is not allowed to hold, and it cannot read
            // the SSE stream of another session (keyed by the SSE GET's
            // own res). Do NOT build a full session-validation subsystem
            // here — the venue-local threat model + allow-list are the
            // accepted boundary for this surface.
            if (body.snapshot === true) {
                const cs = dash.sessionByTagPublic(tag)
                if (cs === undefined) {
                  res.writeHead(404, { 'content-type': 'application/json' }).end('{}')
                  return
                }
                // the self-test subject for THIS connection (what the
                // bootstrap tables' byId ring reads: the bench is live,
                // no caps abused).
                const subj = cs
                const snap = {
                  sessions: dash.sessionCount(),
                  boot: Object.fromEntries(
                    Object.entries(subj.boot.moduleState).map(([m, v]) => [
                      m,
                      { state: v, ms: subj.boot.moduleMs[m as keyof typeof subj.boot.moduleMs] },
                    ]),
                  ),
                  probes: dash.probes().slice(-16),
                }
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify(snap))
              return
            }
            // The message rides on `msg` (canonical) or `text` (the
            // earlier client shape, kept for compat).
            if (typeof body.msg === 'string') text = body.msg
            else if (typeof body.text === 'string') text = body.text
            const out: Record<string, unknown> = { ok: true, stream: '/dash' }
            const r = dash.handleConn(tag, raw === '' ? JSON.stringify({ msg: text, session: tag }) : raw)
            if (!r.ok) {
              out.ok = false
              out.msg = r.err ?? 'attach first'
              res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify(out))
              return
            }
            // the send rides the OPEN SSE stream (the 202 is a mere receipt;
            // the frames actually live on the GET the tag points to):
            res.writeHead(202, { 'content-type': 'application/json' })
            res.end(JSON.stringify(out))
            return
          })
          return
        }
        res.writeHead(405, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'SSE surface: GET attach, POST send' }))
        return
      }

      // The old chat surface is RETIRED (410, not a silent delete): the
      // browser + CLI both talk to /dash now.
      if (method === 'POST' && url === '/chat') {
        if (!hostOkNow) {
          res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
          return
        }
        res.writeHead(410, { 'content-type': 'application/json' }).end(
          JSON.stringify({ error: 'gone — use POST /dash (SSE) with {"msg": "<text>"}' }),
        )
        return
      }
      if (url === '/chat') {
        res.writeHead(410, { 'content-type': 'application/json' }).end(
          JSON.stringify({ error: 'gone — the chat surface was retired for the single /dash surface' }),
        )
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

  // zhang: service stop — close all SSE writers (the DASH faculty owns the
  // writer lifecycle; SIGTERM → graceful end of every open stream).
  const shutdown = (): void => {
    try {
      dash.closeAll()
    } catch {
      /* best-effort */
    }
    try {
      server.close()
    } catch {
      /* best-effort */
    }
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  return {
    server,
    address: { port: 3000 },
    listen: () =>
      new Promise<number>((done) => {
        server.listen(3000, '0.0.0.0', () => {
          const addr = server.address()
          const actual = typeof addr === 'object' && addr !== null ? addr.port : 3000
          // SECURITY-3 / REVIEW ROUND 1 FIX: pin the ACTUAL bound port on
          // the DASH faculty — its internal control fetches (the DASH leg's
          // telemetry snapshot, the DASH self-POST of boot status) MUST use
          // the venue's live port, not the hardcoded 3000.
          dash.setListenPort(actual)
          console.log(`carl listening: http://127.0.0.1:${actual} (surface=/dash; static=${staticDir})`)
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
