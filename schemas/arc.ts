export const ARC_STATES = ['OPEN', 'ACTIVE', 'DEFERRED', 'RESOLVED', 'ABSORBED'] as const

export type ArcState = typeof ARC_STATES[number]

export function isArcState(value: unknown): value is ArcState {
  return typeof value === 'string' && (ARC_STATES as readonly string[]).indexOf(value) !== -1
}
