export interface Synapse {
  publish<TEvent>(event: TEvent, channel?: string): Promise<void>
  subscribe<TEvent>(eventType: string, handler: (event: TEvent) => Promise<void>, faculty?: string): void
  darkLane(payload: Uint8Array, destination: string): Promise<void>
  /**
   * NS observes its own flow: every intervalMs the bus publishes
   * 'ns.telemetry' (telemetry lane) with per-lane per-second delivery rates,
   * cumulative totals, and per-origin-faculty counts (data plane R1).
   * The 'ns' component id is granted on the telemetry lane by the
   * permission map FOR THIS OBSERVER ROLE ONLY (read-only of itself).
   */
  nsTelemetry(intervalMs: number): void
}
