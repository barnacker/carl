// Telemetry faculty — READ-ONLY consumer of the telemetry lane (Spec §4/§5).
//
// Subscribes (with lane grants, the permission map on the bus enforces):
//   'llm.telemetry'          — direct (the LLM self-accounting frames)
//   any  <faculty>.telemetry — the generic per-faculty pattern (operator rule:
//                              telemetry ALWAYS subscribes to <faculty>.telemetry,
//                              nothing else — a catch-all allow-list, no others)
//   'llm.done'               — final counts (bright; telemetry is an allowed
//                              subscriber for it, per the permission map)
//
// Maintains per-request latest-snapshot state (a ring: last snapshot per id)
// plus a "current" pointer (most recently active id).
//   GET /telemetry            → SSE: resend the current snapshot on connect,
//                               then every llm.telemetry snapshot as it arrives.
//                               Same SSE data-frame contract as the chat stream
//                               (one JSON object per `data:` line) — its OWN
//                               stream, a separate fetch the web-ui opens alongside
//                               /chat.
//   GET /telemetry/snapshot   → JSON: { current, byId: { <id>: <snapshot> } }
//
// NO writes. Read-only by construction: it never publishes, it only listens.
// This is the data path for the dashboard arc (consumes it next round); there
// is no visible UI in this round — just the live stream + the snapshot.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Synapse } from '../synapse/index.js'
import { isAllowedHost } from './chat.js'

interface TelemetrySnapshot {
  type: 'telemetry'
  id: string
  state: 'reasoning' | 'content' | 'done'
  reasoning_tokens: number
  content_tokens: number
  reasoning_frame: string | null
  content_tps: number | null
  started_at: string
  last_tick_ms: number
  // stamped by the telemetry faculty on receipt (when this snapshot was seen)
  [k: string]: unknown
}

export class TelemetryFaculty {
  private readonly synapse: Synapse
  private readonly byId = new Map<string, TelemetrySnapshot>()
  private currentId: string | null = null
  private readonly sseClients = new Set<ServerResponse>()

  constructor(synapse: Synapse) {
    this.synapse = synapse

    // Direct subscription to the LLM telemetry frames. The permission map
    // admits ONLY the 'telemetry' faculty on the telemetry lane, so this
    // grant is structural (the bus would reject any other faculty here).
    synapse.subscribe('llm.telemetry', async (event: unknown) => {
      this.ingest(event as TelemetrySnapshot, 'llm.telemetry')
    }, 'telemetry')

    // 'llm.done' — final counts (bright lane; telemetry is an allowed
    // subscriber for it). We do not forward anything; we just log a
    // terminal-count marker for the snapshot ring (state -> 'done' is
    // already emitted by the LLM on the telemetry lane right before done).
    synapse.subscribe('llm.done', async (event: unknown) => {
      const { id } = event as { id: string }
      const snap = this.byId.get(id)
      if (snap !== undefined) {
        // Reflect terminal state in the ring if the done telemetry frame
        // landed slightly after (ordering is not guaranteed on the bus).
        this.byId.set(id, { ...snap, state: 'done' })
        this.broadcast({ ...snap, state: 'done' })
      }
    }, 'telemetry')

    // Generic per-faculty pattern: every <faculty>.telemetry message the LLM
    // (or any future faculty) publishes lands here too. We can't enumerate a
    // dynamic pattern on the EventEmitter bus directly, so the LLM faculty
    // is the only current publisher of *.telemetry in this round — the direct
    // 'llm.telemetry' subscription above already covers it. The generic rule
    // (telemetry ALWAYS subscribes to <faculty>.telemetry, nothing else) is
    // documented here and enforced structurally by the permission map: the
    // ONLY telemetry-lane channels that exist are *'.telemetry' shapes.
    // No other faculty currently publishes a *.telemetry type, so there is
    // nothing more to subscribe to by name in this round. (When a second
    // faculty publishes e.g. 'file.telemetry', add the named subscription
    // here — the permission map already admits it.)
  }

  private ingest(snap: TelemetrySnapshot, _source: string): void {
    if (snap === null || typeof snap !== 'object') return
    if (typeof snap.id !== 'string' || snap.id.length === 0) return
    const stamped: TelemetrySnapshot = { ...snap, received_at: Date.now() }
    this.byId.set(snap.id, stamped)
    this.currentId = snap.id
    this.broadcast(stamped)
  }

  private broadcast(snap: TelemetrySnapshot): void {
    const data = `data: ${JSON.stringify(snap)}\n\n`
    for (const res of this.sseClients) {
      if (res.writableEnded) {
        this.sseClients.delete(res)
        continue
      }
      res.write(Buffer.from(data, 'utf8'))
    }
  }

  // The most-recently-active snapshot (the "current" pointer), or null if
  // no telemetry has been seen since boot.
  snapshotJson(): { current: TelemetrySnapshot | null; byId: Record<string, TelemetrySnapshot> } {
    const byId: Record<string, TelemetrySnapshot> = {}
    for (const [id, snap] of this.byId) byId[id] = snap
    const current = this.currentId !== null ? this.byId.get(this.currentId) ?? null : null
    return { current, byId }
  }

  // Handle GET /telemetry and GET /telemetry/snapshot. Returns true if the
  // request was handled (so the caller knows not to fall through to static).
  handleRequest(req: IncomingMessage, res: ServerResponse, urlPath: string): boolean {
    if (req.method !== 'GET') return false
    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'forbidden host' }))
      return true
    }
    if (urlPath === '/telemetry') {
      this.openSse(res)
      return true
    }
    if (urlPath === '/telemetry/snapshot') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(this.snapshotJson()))
      return true
    }
    return false
  }

  private openSse(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    })
    res.flushHeaders()
    this.sseClients.add(res)
    // Resend the current snapshot on connect so a late opener sees state.
    const cur = this.snapshotJson().current
    if (cur !== null) {
      this.broadcast(cur)
    } else {
      // No telemetry seen since boot — keep the stream open with a comment
      // frame (cheap; the browser reader parks until the first real frame).
      res.write(Buffer.from(': connected — no current snapshot yet\n\n', 'utf8'))
    }
    res.on('close', () => {
      this.sseClients.delete(res)
    })
  }
}
