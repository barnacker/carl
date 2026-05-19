import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const jsonlJournalBoundary = 'trace/jsonl-journal' as const

export interface JsonlJournalWriter<TEvent> {
  readonly path: string
  append(event: TEvent): void
}

export interface CreateJsonlJournalWriterOptions {
  readonly path: string
}

export function createJsonlJournalWriter<TEvent>(options: CreateJsonlJournalWriterOptions): JsonlJournalWriter<TEvent> {
  mkdirSync(dirname(options.path), { recursive: true })

  return {
    path: options.path,

    append(event: TEvent): void {
      appendFileSync(options.path, `${JSON.stringify(event)}\n`, 'utf8')
    },
  }
}

export function readJsonlJournal<TEvent>(path: string): readonly TEvent[] {
  if (!existsSync(path)) {
    throw new Error(`Trace journal not found: ${path}`)
  }

  const text = readFileSync(path, 'utf8')
  if (text.trim().length === 0) {
    return []
  }

  return text.split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as TEvent
      } catch (error) {
        throw new Error(`Malformed JSONL trace journal at ${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
}
