# CARL web UI v1 — operator runbook

One origin: the harness. The browser talks only to the harness; the harness relays
to vLLM and back. Each token (delta.content AND delta.reasoning, in arrival order)
becomes one SSE frame at the moment it arrives — no buffering.

## Run

```
CARL_VLLM_NO_AUTH=1 PORT=3000 web/run.sh
# -> http://localhost:3000
```

`run.sh` is a pre-flight gate: builds the SvelteKit SPA if missing (web-ui/),
tsc if dist/ is missing, runs one real 1-token vLLM call so a broken key fails at
boot, then execs the harness.

## Endpoints

- `GET /` — SPA (SvelteKit build under web-ui/build/, adapter-static 200.html
  fallback for no-extension route depth).
- `POST /v1/chat` — the SSE relay. Body: `{"messages":[{"role":"system|user","content":"..."}]}`.
  Response: `text/event-stream`, one `data: <token>\n\n` frame per token, then
  `data: [DONE]\n\n`. Errors: `data: <message>\n\n` followed by `data: [DONE]\n\n`.
- Everything else: 404. BAD / OPTION verbs on the SPA: 405.

## Host allowlist (security)

Only same-origin requests from the harness's own server may call the
endpoint. `Host` is parsed; allowed names are `127.0.0.1`, `localhost`, `hermes`
(any port). Anything else is 403 `{"error":"forbidden host"}`. Subdomains of
`hermes` are NOT allowed (only the bare box hostname, per operator addendum
2026-10-26).

The rule is enforced once, on the same-origin gate in `web/server.ts`, on every
request (POST /v1/chat and static GET/HEAD). No other host-line checks, no extra
state, no extension.

## Build

- Root: `npm run build` (tsc) — produces `dist/web/server.js`.
- UI: `cd web-ui && npm install && npx vite build` — produces
  `web-ui/build/{200.html,_app/**}` (SvelteKit 2 + Svelte 5 + Vite 6,
  adapter-static SPA mode).

## Test

- `npm test` in the root — 48 tests. Two of them cover the host allowlist
  boundary (accepts loopback/localhost/hermes with/without port; rejects external
  IPs and odd hostnames). All 46 pre-existing tests are unchanged.

## Live-streaming proof

The harness logs one line per request with the first / last SSE write absolute
timestamps, span, and byte count:

```
web-ui stream done: firstByte=<ISO> lastByte=<ISO> span_ms=<N> bytes=<N>
```

That log IS the streaming proof — the times are set in server code at the moment
`res.write()` is called per token, in the moment tokens arrive from vLLM. The
per-line server log matches the client-side receive times (observed delta ≤1ms
on LAN loopback).

## Probe from the shell

```
# real 1-token chat (host loopback name)
curl -N -H 'content-type: application/json' \
  --data '{"messages":[{"role":"user","content":"say pong, then stop"}]}' \
  http://127.0.0.1:3000/v1/chat

# hermes-host mapping (operator addendum)
curl -N -H 'Host: hermes:3000' -H 'content-type: application/json' \
  --data '{"messages":[{"role":"user","content":"say pong, then stop"}]}' \
  http://127.0.0.1:3000/v1/chat

# external host -> 403
curl -sS -H 'Host: evil.example.com' -H 'content-type: application/json' \
  --data '{"messages":[{"role":"user","content":"x"}]}' -o - \
  -w '\nhttp=%{http_code}\n' http://127.0.0.1:3000/v1/chat
```

## Files

- `web/server.ts`         — HTTP server + SSE relay + static serving.
- `bin/carl-web.js`       — entrypoint.
- `web/run.sh`            — boot gate (build, preflight, exec).
- `web-ui/`               — SvelteKit SPA. `src/lib/Chat.svelte` is the single
  Chat component; `src/routes/+page.svelte` renders it.
- `tests/web/server.test.js` — host-allowlist unit tests.
- `package.json`          — new bin `carl-web` + script.
- `tsconfig.json`         — `web/**/*.ts` included.
- `.gitignore`            — added `.svelte-kit/` (SvelteKit's runtime mirror of
  the source; not build artifact, not source).

## Constraints

- No routing, no auth, no multi-user, no message-history persistence past the
  in-memory + localStorage runtime session (work item 4 of the spec).
- No new runtime dependencies. Web UI's devDeps are confined to `web-ui/`
  (its own package.json, isolated from the root).
- The UI host's vLLM relay response is a `text/event-stream` relay of
  `delta.content` + `delta.reasoning` in arrival order — that last part is the
  "live pipe" where the model's full output (answers AND reasoning) is what
  shows on the UI. The 27B Qwen outputs reasoning first, content after; the UI
  shows both, exactly as the live-stack pipe does.
