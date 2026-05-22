import { deriveArcState, type Arc, type DerivedArcState } from '../schemas/arc.js'

export const orientationLoopBoundary = 'orientation-loop' as const
export const focusCycleRuleset = 'alpha-mvc-focus-cycle/v1' as const

export type FacultyRole = 'PERSONA' | 'MODEL_FACULTY' | 'HIGH_REASONING' | 'CODE' | 'MINI_MODEL' | 'OTHER'

export type SalienceTermName =
  | 'OPENING_EVIDENCE'
  | 'ACTIVATION_EVIDENCE'
  | 'OPERATOR_RECENCY'
  | 'URGENCY_MARKER'
  | 'SECURITY_MARKER'
  | 'TIE_BREAKER'

export interface SalienceTerm {
  readonly name: SalienceTermName
  readonly value: number
  readonly reason: string
}

export interface SalienceScore {
  readonly total: number
  readonly terms: readonly SalienceTerm[]
  /** @deprecated Use total. Kept during Alpha MVC migration. */
  readonly value: number
  /** @deprecated Use terms. Kept during Alpha MVC migration. */
  readonly reasons: readonly string[]
}

export interface FocusCandidate {
  readonly arc: Arc
  readonly arcId: string
  readonly title: string
  readonly presentationState: DerivedArcState
  /** @deprecated Use presentationState. Kept for current FocusCandidate read-model compatibility. */
  readonly state: DerivedArcState
  readonly createdAt: number
  readonly activatedAt?: number
  readonly resolvedAt?: number
  readonly salience: SalienceScore
}

export interface FocusDecision {
  readonly arcId: string
  readonly selectedTitle: string
  readonly selectedState: DerivedArcState
  readonly facultyId: string
  readonly facultyRole: FacultyRole
  readonly reason: string
  readonly salience: SalienceScore
}

export interface FocusCycle {
  readonly cycleId: string
  readonly createdAt: number
  readonly candidates: readonly FocusCandidate[]
  readonly decision: FocusDecision
  readonly ruleset: typeof focusCycleRuleset
}

export interface FocusCycleInput {
  readonly cycleId?: string
  readonly createdAt?: number
}

export interface OrientationLoopDependencies {
  readonly defaultFacultyId?: string
  readonly scoreArc?: (arc: Arc) => SalienceScore
  readonly selectFaculty?: (candidate: FocusCandidate) => Pick<FocusDecision, 'facultyId' | 'facultyRole' | 'reason'>
  readonly now?: () => number
  readonly createFocusCycleId?: () => string
}

export interface OrientationLoop {
  scoreArc(arc: Arc): SalienceScore
  selectFocusCandidate(arcs: readonly Arc[]): FocusCandidate | undefined
  decideFocus(candidate: FocusCandidate): FocusDecision
  createFocusCycle(arcs: readonly Arc[], input?: FocusCycleInput): FocusCycle
}

const URGENCY_PATTERN = /\b(urgent|asap|now|emergency|blocked)\b/i
const SECURITY_PATTERN = /\b(security|privacy|token|credential|leak|breach)\b/i

function hasTerminalArcFact(arc: Arc): boolean {
  return arc.resolved_at !== undefined || arc.absorbed_into_arc_id !== undefined
}

function createSalienceScore(terms: readonly SalienceTerm[]): SalienceScore {
  const total = terms.reduce((sum, term) => sum + term.value, 0)
  return {
    total,
    value: total,
    terms,
    reasons: terms.map((term) => term.reason),
  }
}

function evidenceTerm(arc: Arc): SalienceTerm {
  if (arc.activated_at !== undefined) {
    return {
      name: 'ACTIVATION_EVIDENCE',
      value: 100,
      reason: 'ARC_ACTIVE trace evidence marks this Arc as activated for immediate Cortex processing.',
    }
  }

  return {
    name: 'OPENING_EVIDENCE',
    value: 80,
    reason: 'ARC_OPEN trace evidence marks this unresolved Arc as eligible for focus.',
  }
}

function scoreArcTerms(arc: Arc, recencyValue = 0): SalienceScore {
  if (hasTerminalArcFact(arc)) {
    return createSalienceScore([])
  }

  const searchableText = `${arc.title} ${arc.target}`
  const terms: SalienceTerm[] = [evidenceTerm(arc)]

  if (recencyValue > 0) {
    terms.push({
      name: 'OPERATOR_RECENCY',
      value: recencyValue,
      reason: `Operator recency contributes +${recencyValue}.`,
    })
  }

  if (URGENCY_PATTERN.test(searchableText)) {
    terms.push({
      name: 'URGENCY_MARKER',
      value: 40,
      reason: 'Urgency marker detected in Arc title or target.',
    })
  }

  if (SECURITY_PATTERN.test(searchableText)) {
    terms.push({
      name: 'SECURITY_MARKER',
      value: 50,
      reason: 'Security marker detected in Arc title or target.',
    })
  }

  return createSalienceScore(terms)
}

function createFocusCandidate(arc: Arc, salience: SalienceScore, engagedArcId?: string): FocusCandidate {
  const presentationState = deriveArcState(arc, engagedArcId === undefined ? {} : { engaged_arc_id: engagedArcId })
  return {
    arc,
    arcId: arc.id,
    title: arc.title,
    presentationState,
    state: presentationState,
    createdAt: arc.created_at,
    ...(arc.activated_at !== undefined ? { activatedAt: arc.activated_at } : {}),
    ...(arc.resolved_at !== undefined ? { resolvedAt: arc.resolved_at } : {}),
    salience,
  }
}

function sortCandidates(left: FocusCandidate, right: FocusCandidate): number {
  if (right.salience.total !== left.salience.total) {
    return right.salience.total - left.salience.total
  }

  if (right.createdAt !== left.createdAt) {
    return right.createdAt - left.createdAt
  }

  return left.arcId.localeCompare(right.arcId)
}

function recencyValueForIndex(index: number): number {
  if (index === 0) {
    return 30
  }
  if (index === 1) {
    return 20
  }
  if (index === 2) {
    return 10
  }
  return 0
}

function createDecisionReason(selected: FocusCandidate, candidates: readonly FocusCandidate[]): string {
  const tiedByScore = candidates.filter((candidate) => candidate.salience.total === selected.salience.total)
  if (tiedByScore.length === 1) {
    return `Selected highest salience candidate using ${focusCycleRuleset}.`
  }

  const newestCreatedAt = Math.max(...tiedByScore.map((candidate) => candidate.createdAt))
  const tiedByScoreAndTime = tiedByScore.filter((candidate) => candidate.createdAt === newestCreatedAt)
  if (selected.createdAt === newestCreatedAt && tiedByScoreAndTime.length === 1) {
    return `Selected highest salience candidate using ${focusCycleRuleset}; tie resolved by newest created_at.`
  }

  return `Selected highest salience candidate using ${focusCycleRuleset}; tie resolved by lexicographic Arc id.`
}

export function createOrientationLoop(dependencies: OrientationLoopDependencies = {}): OrientationLoop {
  const now = dependencies.now ?? (() => Date.now())
  const createFocusCycleId = dependencies.createFocusCycleId ?? (() => `focus-${now()}`)
  const scoreArc = dependencies.scoreArc ?? ((arc: Arc) => scoreArcTerms(arc))

  return {
    scoreArc,

    selectFocusCandidate(arcs: readonly Arc[]): FocusCandidate | undefined {
      const selected = arcs
        .map((arc) => createFocusCandidate(arc, scoreArc(arc)))
        .filter((candidate) => candidate.salience.total > 0)
        .sort(sortCandidates)[0]

      return selected === undefined
        ? undefined
        : createFocusCandidate(selected.arc, selected.salience, selected.arcId)
    },

    decideFocus(candidate: FocusCandidate): FocusDecision {
      const selected = dependencies.selectFaculty?.(candidate) ?? {
        facultyId: candidate.arc.resource_needs[0] ?? dependencies.defaultFacultyId ?? 'persona-direct',
        facultyRole: 'MODEL_FACULTY' as const,
        reason: `Selected highest salience candidate using ${focusCycleRuleset}.`,
      }

      return {
        arcId: candidate.arcId,
        selectedTitle: candidate.title,
        selectedState: candidate.state,
        salience: candidate.salience,
        ...selected,
      }
    },

    createFocusCycle(arcs: readonly Arc[], input: FocusCycleInput = {}): FocusCycle {
      const unresolved = arcs.filter((arc) => !hasTerminalArcFact(arc))
      if (unresolved.length === 0) {
        throw new Error('Cannot create FocusCycle without unresolved Arc candidates.')
      }

      const recencyRankByArcId = new Map(
        [...unresolved]
          .sort((left, right) => right.created_at - left.created_at || left.id.localeCompare(right.id))
          .map((arc, index) => [arc.id, recencyValueForIndex(index)]),
      )
      const candidates = unresolved
        .map((arc) => createFocusCandidate(
          arc,
          dependencies.scoreArc === undefined
            ? scoreArcTerms(arc, recencyRankByArcId.get(arc.id) ?? 0)
            : scoreArc(arc),
        ))
        .filter((candidate) => candidate.salience.total > 0)
        .sort(sortCandidates)

      const selected = candidates[0]
      if (selected === undefined) {
        throw new Error('Cannot create FocusCycle without positive salience candidates.')
      }

      const projectedCandidates = candidates.map((candidate) => createFocusCandidate(
        candidate.arc,
        candidate.salience,
        selected.arcId,
      ))
      const selectedProjection = projectedCandidates[0]
      if (selectedProjection === undefined) {
        throw new Error('Cannot create FocusCycle without selected Arc projection.')
      }

      const focusDecision = this.decideFocus(selectedProjection)
      const decision: FocusDecision = {
        ...focusDecision,
        reason: dependencies.selectFaculty === undefined ? createDecisionReason(selectedProjection, projectedCandidates) : focusDecision.reason,
      }

      return {
        cycleId: input.cycleId ?? createFocusCycleId(),
        createdAt: input.createdAt ?? now(),
        candidates: projectedCandidates,
        decision,
        ruleset: focusCycleRuleset,
      }
    },
  }
}
