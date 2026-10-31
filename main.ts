import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootIfNot, newSession, dropSession, dispatchOp, startTurn,
} from './faculties/dash/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CARL_PORT ?? 3000);
const HOST = process.env.CARL_HOST ?? '0.0.0.0';
const WEB_BUILD = path.resolve(__dirname, '..', 'web-ui', 'build');

// The state tree boots at process start (the tree is the single writer; the
// banner renders client-side from the entry frame + live waves).
bootIfNot();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  // binary-safe: woff2 must round-trip as a Buffer (a utf-8 read mangles it)
  let body: Buffer;
  let fellBack = false;
  try {
    body = await readFile(path.join(WEB_BUILD, file));
  } catch {
    body = await readFile(path.join(WEB_BUILD, 'index.html')); // SPA fallback
    fellBack = true;
  }
  const ext = path.extname((fellBack ? 'index.html' : file).toLowerCase());
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
  });
  res.end(body);
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 64 * 1024) { req.destroy(); return; } // body cap
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/sse' && req.method === 'GET') {
    // THE single tagged stream (kd + tx). The client connects with NO id:
    // the server mints oper-<random> and returns it in the ENTRY frame's
    // 'to'. Then SILENCE until a change (dirty-only waves; no no-op; no
    // hot-field re-emit). A reconnect = a fresh entry (V1 re-snapshot) +
    // live waves from that point.
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write('retry: 1500\n\n');
    let closed = false;
    const session = newSession((f) => {
      if (closed) return;
      try { res.write('data: ' + JSON.stringify(f) + '\n\n'); } catch { closed = true; }
    });
    // the entry frame is the only frame on connect (data=full tree, hp=map)
    process.nextTick(() => { if (!closed) session.send(
      { t: 'kd', from: 'carl', to: session.route,
        data: treeSnapData(), hp: treeSnapHp() });
    });
    const cleanup = () => { if (!closed) { closed = true; dropSession(session.id); } };
    req.on('close', cleanup);
    req.on('error', cleanup);
    return;
  }

  if (url.pathname === '/sse' && req.method === 'POST') {
    // THE op/echo path (reused): the client POSTs tx frames (kind usr / op).
    //   usr (from:oper-id, to:crtx): mock brain turn — crtx active (kd),
    //        tx ans chunks in-order, crtx service (kd).
    //   op  (from:oper-id, to:<faculty>): data.op dispatch (selftest -> immu).
    const body = (await parseBody(req)) as { t?: unknown; from?: unknown; to?: unknown; kind?: unknown; data?: unknown } | null;
    const from = typeof body?.from === 'string' ? body.from : '';
    const to = typeof body?.to === 'string' ? body.to : '';
    const kind = typeof body?.kind === 'string' ? body.kind : '';
    const data = (typeof body?.data === 'object' && body!.data !== null) ? body!.data as { [k: string]: unknown } : {};
    const session = from ? sessionsGet(from) : undefined;
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    if (!session) return; // unknown oper-id: the wire is live, the frame is dropped
    if (kind === 'usr' && to === 'crtx') { void startTurn(session, data.text as string ?? ''); }
    else if (kind === 'op') { dispatchOp(session, to, data); }
    return;
  }

  if (req.method === 'GET') { await serveStatic(req, res); return; }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

// session + snapshot accessors (kept local to the wire layer, not the tree)
import { routeSession, snapshotTree, handleTable } from './faculties/tree.js';
function sessionsGet(id: string) { return routeSession(id); }
function treeSnapData() { return snapshotTree(); }
function treeSnapHp() { return handleTable(); }

server.listen(PORT, HOST, () => {
  process.stderr.write('carl-01 listening on :' + PORT + '\n');
});
