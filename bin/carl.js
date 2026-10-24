#!/usr/bin/env node
import { createVllmModel, resolveModelConfig } from '../dist/model/vllm.js'

function usage() {
  process.stderr.write('usage: carl --ask "<question>"\n')
}

function main() {
  if (process.env.CARL02_FAKE_MODEL_RESPONSE !== undefined) {
    process.stdout.write(`${process.env.CARL02_FAKE_MODEL_RESPONSE}\n`)
    process.exit(0)
  }

  const args = process.argv.slice(2)
  if (args[0] !== '--ask' || typeof args[1] !== 'string' || args[1].length === 0) {
    usage()
    process.exit(2)
  }
  const question = args[1]

  const { chat } = createVllmModel(resolveModelConfig(process.env))
  chat([
    { role: 'system', content: 'You are the cortex result for CARL. Respond concisely.' },
    { role: 'user', content: question },
  ]).then(
    (reply) => {
      process.stdout.write(`${reply}\n`)
      process.exit(0)
    },
    (error) => {
      process.stderr.write(`error.runtime=bare-cortex\n${error.message}\n`)
      process.exit(1)
    },
  )
}

main()
