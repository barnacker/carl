export const ORIGIN_TYPES = ['OPERATOR', 'FACULTY', 'SYSTEM'] as const
export const AUTHORITIES = ['OPERATOR', 'CORTEX', 'OPTIMIZATION', 'SEB', 'FACULTY', 'REFLEX'] as const

export type OriginType = typeof ORIGIN_TYPES[number]
export type Authority = typeof AUTHORITIES[number]

export interface OriginStamp {
  readonly origin_id: string
  readonly origin_type: OriginType
  readonly authenticated: true
  readonly authority: Authority
  readonly issued_at: number
  readonly nonce: string
  readonly signature_hash: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isOriginType(value: unknown): value is OriginType {
  return typeof value === 'string' && (ORIGIN_TYPES as readonly string[]).includes(value)
}

export function isAuthority(value: unknown): value is Authority {
  return typeof value === 'string' && (AUTHORITIES as readonly string[]).includes(value)
}

export function isOriginStamp(value: unknown): value is OriginStamp {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.origin_id === 'string'
    && value.origin_id.length > 0
    && isOriginType(value.origin_type)
    && value.authenticated === true
    && isAuthority(value.authority)
    && typeof value.issued_at === 'number'
    && Number.isFinite(value.issued_at)
    && typeof value.nonce === 'string'
    && value.nonce.length > 0
    && typeof value.signature_hash === 'string'
    && value.signature_hash.length > 0
}

export function assertOriginStamp(value: unknown): OriginStamp {
  if (!isOriginStamp(value)) {
    throw new Error('Invalid OriginStamp')
  }

  return value
}
