export interface Synapse {
  publish<TEvent>(event: TEvent): Promise<void>
  subscribe<TEvent>(eventType: string, handler: (event: TEvent) => Promise<void>): void
  darkLane(payload: Uint8Array, destination: string): Promise<void>
}
