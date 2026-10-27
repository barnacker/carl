#!/usr/bin/env node
import * as crypto from 'node:crypto'

import { Bus, createSynapse } from '../dist/nervous-system.js'
import { LLMFACULTY } from '../dist/faculties/llm.js'
import { recreateCortex } from '../dist/cortex.js'

function usage() {
  process.stderr.write('usage: carl --ask "<question>" [--model <model>]\n')
}

const args = process.argv.slice(2)
if (args.includes('-h') || args.includes('--help')) {
  usage()
  process.exit(0)
}
if (args[0] !== '--ask' || typeof args[1] !== 'string' || args[1].length === 0) {
  usage()
  process.exit(2)
}
const question = args[1]
const modelIdx = args.indexOf('--model')
let model
if (modelIdx !== -1) {
  model = args[modelIdx + 1]
  if (typeof model !== 'string' || model.length === 0) {
    usage()
    process.exit(2)
  }
}

// main.ts reality: bootstrap() returns { server, address, listen } and
// dist/main.js binds :3000 at import, so a CLI that imports dist/main.js
// would EADDRINUSE whenever another instance runs. The CLI therefore
// composes the same runtime pieces from the same dist modules (Bus ->
// Synapse -> Cortex -> LLMFACULTY) without the HTTP server: publish
// cortex.request, consume the chat.response relay, exit on done/error.
const bus = new Bus()
const synapse = createSynapse(bus)
void new LLMFACULTY(synapse)
void new recreateCortex(synapse)

const id = crypto.randomUUID()

// Live stack: each token hits stdout the moment it arrives, while the model
// is still generating. The tokens on the wire ARE the output, plus a
// trailing newline at done — same contract as the old direct model client.
synapse.subscribe('chat.response', async (event) => {
  const ev = event
  if (ev.id !== id) return
  if (ev.type === 'token' && typeof ev.text === 'string') {
    process.stdout.write(ev.text)
  } else if (ev.type === 'done') {
    process.stdout.write('\n')
    process.exit(0)
  } else if (ev.type === 'error') {
    process.stderr.write(`error.runtime=cortex\n${ev.message}\n`)
    process.exit(1)
  }
})

await synapse.publish(
  {
    type: 'prompt',
    id,
    messages: [
      { role: 'system', content: 'You are the cortex result for CARL. Respond concisely.' },
      { role: 'user', content: question },
    ],
    ...(model !== undefined ? { model } : {}),
  },
  'cortex.request',
)
