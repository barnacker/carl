export interface InMemoryTraceCollector<TEvent> {
  append(event: TEvent): void
  list(): readonly TEvent[]
  clear(): void
}

export function createInMemoryTraceCollector<TEvent>(): InMemoryTraceCollector<TEvent> {
  const events: TEvent[] = []

  return {
    append(event: TEvent): void {
      events.push(event)
    },

    list(): readonly TEvent[] {
      return [...events]
    },

    clear(): void {
      events.length = 0
    },
  }
}
