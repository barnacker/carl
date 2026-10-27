#!/usr/bin/env node
import { resolve } from 'node:path'

import { bootstrap } from '../dist/main.js'

function usage() {
  process.stderr.write('usage: carl-web [--port <port>] [--static <dir>]\n')
}

const args = process.argv.slice(2)
let port
let staticDir
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (a === '--port') port = Number(args[++i])
  else if (a === '--static') staticDir = resolve(args[++i] ?? '')
  else if (a === '-h' || a === '--help') {
    usage()
    process.exit(0)
  }
}

const { listen } = createWebServer({ port, staticDir })
listen().catch((err) => {
  process.stderr.write(`carl-web: failed to start: ${err.message}\n`)
  process.exit(1)
})
