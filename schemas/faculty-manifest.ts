import type { CapabilitySet } from './capabilities.js'

export interface FacultyManifest {
  readonly id: string
  readonly version: string
  readonly handles: readonly string[]
  readonly emits: readonly string[]
  readonly requestedCapabilities: CapabilitySet
}
