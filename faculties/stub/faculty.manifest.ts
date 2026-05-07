import type { FacultyManifest } from '../../schemas/index.js'

export const stubFacultyManifest: FacultyManifest = {
  id: 'stub',
  version: '0.1.0',
  handles: ['stub.execute'],
  emits: ['stub.executed'],
  requestedCapabilities: {
    actions: ['READ'],
    domains: ['SYSTEM'],
    dataClasses: ['STUB_REQUEST'],
    filesystem: { read: [], write: [] },
    network: { outbound: [] },
    secrets: { read: [] },
    resources: {
      maxCpuMsPerArc: 100,
      maxMemoryMb: 64,
      maxOpenFiles: 4,
      maxWallTimeMs: 1000
    }
  }
}
