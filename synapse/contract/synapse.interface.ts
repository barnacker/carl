export interface Synapse {
  publish<TEvent>(event: TEvent, channel?: string): Promise<void>
  subscribe<TEvent>(eventType: string, handler: (event: TEvent) => Promise<void>): void
  darkLane(payload: Uint8Array, destination: string): Promise<void>
}
