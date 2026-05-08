import type { ArcRecord } from '../schemas/arc.js'

export const orientationLoopBoundary = 'orientation-loop' as const

export type FacultyRole = 'PERSONA' | 'HIGH_REASONING' | 'CODE' | 'MINI_MODEL' | 'OTHER'

export interface SalienceScore {
  readonly value: number
  readonly reasons: readonly string[]
}

export interface FocusCandidate {
  readonly arc: ArcRecord
  readonly salience: SalienceScore
}

export interface FocusDecision {
  readonly arcId: string
  readonly facultyId: string
  readonly facultyRole: FacultyRole
  readonly reason: string
  readonly salience: SalienceScore
}

export interface OrientationLoopDependencies {
  readonly defaultFacultyId?: string
  readonly scoreArc?: (arc: ArcRecord) => SalienceScore
  readonly selectFaculty?: (candidate: FocusCandidate) => Pick<FocusDecision, 'facultyId' | 'facultyRole' | 'reason'>
}

export interface OrientationLoop {
  scoreArc(arc: ArcRecord): SalienceScore
  selectFocusCandidate(arcs: readonly ArcRecord[]): FocusCandidate | undefined
  decideFocus(candidate: FocusCandidate): FocusDecision
}

const NON_FOCUS_STATES: readonly ArcRecord['state'][] = ['RESOLVED', 'ABSORBED', 'DEFERRED']

function defaultScoreArc(arc: ArcRecord): SalienceScore {
  if (NON_FOCUS_STATES.includes(arc.state)) {
    return {
      value: 0,
      reasons: [`arc state ${arc.state} is not eligible for immediate focus`],
    }
  }

  const activeBonus = arc.state === 'ACTIVE' ? 10 : 5
  const unresolvedTaskBonus = arc.tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED').length
  const resourceNeedBonus = arc.resource_needs.length

  return {
    value: activeBonus + unresolvedTaskBonus + resourceNeedBonus,
    reasons: [
      `arc state ${arc.state} is eligible for focus`,
      `${unresolvedTaskBonus} unresolved task(s)`,
      `${resourceNeedBonus} resource need(s)`,
    ],
  }
}

export function createOrientationLoop(dependencies: OrientationLoopDependencies = {}): OrientationLoop {
  const scoreArc = dependencies.scoreArc ?? defaultScoreArc

  return {
    scoreArc,

    selectFocusCandidate(arcs: readonly ArcRecord[]): FocusCandidate | undefined {
      return arcs
        .map((arc) => ({ arc, salience: scoreArc(arc) }))
        .filter((candidate) => candidate.salience.value > 0)
        .sort((left, right) => right.salience.value - left.salience.value)[0]
    },

    decideFocus(candidate: FocusCandidate): FocusDecision {
      const selected = dependencies.selectFaculty?.(candidate) ?? {
        facultyId: candidate.arc.resource_needs[0] ?? dependencies.defaultFacultyId ?? 'faculty/llm/direct',
        facultyRole: 'PERSONA' as const,
        reason: 'Stage 0 direct FocusCycle routes the selected Arc to Persona.',
      }

      return {
        arcId: candidate.arc.id,
        salience: candidate.salience,
        ...selected,
      }
    },
  }
}
