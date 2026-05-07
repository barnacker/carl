export const CAPABILITY_ACTIONS = ['READ', 'WRITE', 'QUERY', 'EXECUTE', 'PUBLISH', 'SUBSCRIBE'] as const
export type CapabilityAction = typeof CAPABILITY_ACTIONS[number]

export const CAPABILITY_DOMAINS = ['MEMORY', 'SYSTEM', 'CONFIG', 'CODE', 'WEB', 'FILE', 'IDENTITY'] as const
export type CapabilityDomain = typeof CAPABILITY_DOMAINS[number]

export interface FilesystemCapabilities {
  readonly read: readonly string[]
  readonly write: readonly string[]
}

export interface NetworkCapabilities {
  readonly outbound: readonly string[]
}

export interface SecretCapabilities {
  readonly read: readonly string[]
}

export interface ResourceCapabilities {
  readonly maxCpuMsPerArc: number
  readonly maxMemoryMb: number
  readonly maxOpenFiles: number
  readonly maxWallTimeMs: number
}

export interface CapabilitySet {
  readonly actions: readonly string[]
  readonly domains: readonly string[]
  readonly dataClasses: readonly string[]
  readonly filesystem: FilesystemCapabilities
  readonly network: NetworkCapabilities
  readonly secrets: SecretCapabilities
  readonly resources: ResourceCapabilities
}

export interface RuntimeActionRequest {
  readonly action: string
  readonly domain: string
  readonly dataClass: string
}
