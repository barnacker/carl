export const ORIGIN_TYPES = ['OPERATOR', 'FACULTY', 'SYSTEM'] as const
export const AUTHORITIES = ['OPERATOR', 'CORTEX', 'OPTIMIZATION', 'SEB', 'FACULTY', 'REFLEX'] as const

export interface OriginStamp {
  readonly origin_id: string
  readonly origin_type: typeof ORIGIN_TYPES[number]
  readonly authenticated: true
  readonly authority: typeof AUTHORITIES[number]
  readonly issued_at: number
  readonly nonce: string
  readonly signature_hash: string
}
