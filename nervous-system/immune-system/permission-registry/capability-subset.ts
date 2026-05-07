import type { CapabilitySet, ResourceCapabilities, RuntimeActionRequest } from '../../../schemas/index.js'

function assertArraySubset(label: string, requested: readonly string[], granted: readonly string[]): void {
  const requestedSet = new Set(requested)
  const excess = granted.filter((item) => !requestedSet.has(item))
  if (excess.length > 0) {
    throw new Error(`${label} grant exceeds request: ${excess.join(', ')}`)
  }
}

function assertResourcesSubset(requested: ResourceCapabilities, granted: ResourceCapabilities): void {
  for (const key of ['maxCpuMsPerArc', 'maxMemoryMb', 'maxOpenFiles', 'maxWallTimeMs'] as const) {
    if (granted[key] > requested[key]) {
      throw new Error(`resources.${key} grant exceeds request: ${granted[key]} > ${requested[key]}`)
    }
  }
}

export function assertCapabilityGrantSubset(requested: CapabilitySet, granted: CapabilitySet): void {
  assertArraySubset('actions', requested.actions, granted.actions)
  assertArraySubset('domains', requested.domains, granted.domains)
  assertArraySubset('dataClasses', requested.dataClasses, granted.dataClasses)
  assertArraySubset('filesystem.read', requested.filesystem.read, granted.filesystem.read)
  assertArraySubset('filesystem.write', requested.filesystem.write, granted.filesystem.write)
  assertArraySubset('network.outbound', requested.network.outbound, granted.network.outbound)
  assertArraySubset('secrets.read', requested.secrets.read, granted.secrets.read)
  assertResourcesSubset(requested.resources, granted.resources)
}

export function isRuntimeActionAllowed(effective: CapabilitySet, request: RuntimeActionRequest): boolean {
  return effective.actions.includes(request.action)
    && effective.domains.includes(request.domain)
    && effective.dataClasses.includes(request.dataClass)
}
