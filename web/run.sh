#!/usr/bin/env bash
# CARL web UI runner.
#
# Boots the harness (SSE endpoint + static SvelteKit build) on $PORT (default 3000).
# The SvelteKit build is required — if `web-ui/build/200.html` is missing, the
# script builds it first (web-ui/ has its own package.json + node_modules).
#
# The vLLM endpoint is open (no auth of any kind): the client does not send an
# Authorization header, and there is no auth/keyless env var to configure. The
# unit's contract is just the port. The pre-flight below still runs one real
# 1-token call so an unreachable endpoint fails LOUDLY at boot, not in the UI.

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"

# Ensure the SvelteKit build exists (static dir served by the harness).
if [[ ! -f web-ui/build/200.html ]]; then
  echo "carl-web: web-ui/build missing — building SvelteKit SPA" >&2
  (cd web-ui && npm install --no-audit --no-fund && npx vite build)
fi
# Root tsc must produce dist/web/server.js.
if [[ ! -f dist/web/server.js ]]; then
  echo "carl-web: dist/web/server.js missing — running tsc" >&2
  npm run build
fi

# Pre-flight: one real call from the model path. The endpoint is open — this
# only proves it is reachable and streaming, not that any key is valid.
node --input-type=module -e '
const { createVllmModel, resolveModelConfig } = await import("./dist/model/vllm.js");
const { chat } = createVllmModel(resolveModelConfig(process.env));
let got = 0;
const t = Date.now();
await chat(
  [{ role: "user", content: "say pong, then stop" }],
  { onToken: () => { got++; } },
);
console.error(`carl-web preflight: ${got} tokens in ${Date.now()-t}ms`);
' || {
  echo "carl-web: model pre-flight FAILED — refusing to boot" >&2
  exit 3
}

exec node bin/carl-web.js --port "$PORT" "$@"
