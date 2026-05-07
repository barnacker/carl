import type { FacultyManifest } from '../../schemas/index.js'

export const memoryFacultyManifest: FacultyManifest = {
  id: 'memory',
  version: '0.1.0',
  handles: [
    'memory.observation.write',
    'memory.short_term.query',
    'memory.crystallized.query'
  ],
  emits: [
    'memory.observation.written',
    'memory.crystallization.proposed'
  ],
  requestedCapabilities: {
    actions: ['READ', 'WRITE', 'QUERY'],
    domains: ['MEMORY'],
    dataClasses: ['OBSERVATION', 'ARC_RECORD', 'REFLEX_ENTRY'],
    filesystem: {
      read: ['runtime/memory/**'],
      write: [
        'runtime/memory/observation-log/**',
        'runtime/memory/short-term/**',
        'runtime/memory/crystallized/**'
      ]
    },
    network: { outbound: [] },
    secrets: { read: [] },
    resources: {
      maxCpuMsPerArc: 500,
      maxMemoryMb: 256,
      maxOpenFiles: 32,
      maxWallTimeMs: 2000
    }
  }
}
