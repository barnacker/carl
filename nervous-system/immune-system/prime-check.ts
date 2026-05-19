export const primeCheckBoundary = 'immune-system/prime-check' as const

export interface PrimePresenceCheckInput {
  readonly path: string
  readonly exists: (path: string) => boolean
}

export interface PrimePresenceCheckResult {
  readonly ok: boolean
  readonly path: string
  readonly reason?: 'PRIME_MISSING'
}

export function checkPrimePresence(input: PrimePresenceCheckInput): PrimePresenceCheckResult {
  if (!input.exists(input.path)) {
    return {
      ok: false,
      path: input.path,
      reason: 'PRIME_MISSING',
    }
  }

  return {
    ok: true,
    path: input.path,
  }
}

export function assertPrimePresence(input: PrimePresenceCheckInput): PrimePresenceCheckResult {
  const result = checkPrimePresence(input)
  if (!result.ok) {
    throw new Error(`PRIME missing: ${input.path}`)
  }

  return result
}
