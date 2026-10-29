import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboard, startTurn } from './faculties/dash/index.js';
import type { Emit } from './faculties/dash/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CARL_PORT ?? 3000);
const HOST = process.env.CARL_HOST ?? '0.0.0.0';
const WEB_BUILD = path.resolve(__dirname, '..', 'web-ui', 'build');

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
      if (size > 64 * 1024) {
        req.destroy(); // body cap: the wire carries one message, not a disk
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/sse' && req.method === 'GET') {
    const session = url.searchParams.get('session');
    const tag = url.searchParams.get('tag') ?? 'terminal';
    if (!session) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing session param' }));
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write('retry: 1500\n\n');
    let closed = false;
    const send: Emit = (f) => {
      if (closed) return;
      try {
        res.write('data: ' + JSON.stringify(f) + '\n\n');
      } catch {
        closed = true;
      }
    };
    const cleanup = () => {
      closed = true;
      dashboard.detach(session, tag);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
    // attach is synchronous framing; the boot block is born at the system's
    // pace (timers) and delivers frame by frame through the same send fn
    dashboard.attach(session, tag, send);
    return;
  }

  if (url.pathname === '/sse' && req.method === 'POST') {
    const body = (await parseBody(req)) as { msg?: unknown; session?: unknown } | null;
    const session = typeof body?.session === 'string' ? body.session : '';
    const msg = typeof body?.msg === 'string' ? body.msg : '';
    // the 202 ack is the door the client's spinner→« flip waits on
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    if (!session || !msg) return;
    // brief settle after the ack (server-side thought time is real time),
    // then the turn block opens and streams the reply row
    const t = setTimeout(() => {
      const emit: Emit = (f) => dashboard.emit(session, 'turn', f);
      void startTurn(session, emit);
    }, 350 + Math.floor(Math.random() * 400));
    t.unref?.();
    return;
  }

  if (req.method === 'GET') {
    await serveStatic(req, res);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  process.stderr.write('carl-01 listening on :' + PORT + '\n');
});
