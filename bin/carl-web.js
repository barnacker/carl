#!/usr/bin/env node
import { bootstrap } from '../dist/main.js'

function usage() {
  process.stderr.write('usage: carl-web\n')
}

const args = process.argv.slice(2)
if (args.includes('-h') || args.includes('--help')) {
  usage()
  process.exit(0)
}
if (args.length > 0) {
  usage()
  process.exit(2)
}

// main.ts reality: bootstrap() returns { server, address, listen } and
// dist/main.js already binds :3000 at import. This CLI is just a process
// wrapper + clean shutdown: bootstrap() keeps the server handle alive, and
// SIGINT/SIGTERM close it explicitly instead of relying on default kill.
const runtime = bootstrap()

function shutdown() {
  runtime.server.close(() => process.exit(0))
  // Don't let a stuck connection hold the process open.
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`carl-web: unhandled rejection: ${reason}\n`)
})

console.log('carl-web up on :3000 — Ctrl-C to stop')
