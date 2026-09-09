import type {
  BeneficiaryEnrollmentStatus,
  BeneficiaryNoteRecord,
  BeneficiaryParticipationRecord,
  BeneficiaryRecord,
  JourneyStageConfig,
} from '@/types/pathways'

import { currentAccount, demoTime, getDemoState, nextId, transactDemo } from './store'

export type BeneficiaryInput = Pick<
  BeneficiaryRecord,
  | 'code'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'sex'
  | 'birthDate'
  | 'age'
  | 'disabilityStatus'
  | 'province'
  | 'city'
  | 'barangay'
  | 'consentToParticipate'
  | 'consentToStoreData'
  | 'isMinor'
  | 'guardianConsent'
> & { projectId: string }

export const possibleDuplicates = (
  input: Pick<BeneficiaryInput, 'code' | 'firstName' | 'lastName' | 'birthDate'>,
  state = getDemoState(),
) =>
  state.beneficiaries.filter(
    (record) =>
      record.code.toLowerCase() === input.code.trim().toLowerCase() ||
      (record.firstName.toLowerCase() === input.firstName.trim().toLowerCase() &&
        record.lastName.toLowerCase() === input.lastName.trim().toLowerCase() &&
        Boolean(input.birthDate) &&
        record.birthDate === input.birthDate),
  )

export function saveBeneficiary(input: BeneficiaryInput, confirmDistinct = false, id?: string) {
  return transactDemo(
    id ? 'beneficiaries.edit' : 'beneficiaries.create',
    input.projectId,
    id,
    (state) => {
      if (
        !input.code.trim() ||
        !input.firstName.trim() ||
        !input.lastName.trim() ||
        !input.projectId ||
        !input.province.trim() ||
        !input.city.trim() ||
        !input.barangay.trim()
      )
        throw new Error('Complete all required beneficiary fields.')
      if (!input.birthDate && !input.age) throw new Error('Enter a birth date or age.')
      if (
        !input.consentToParticipate ||
        !input.consentToStoreData ||
        (input.isMinor && !input.guardianConsent)
      )
        throw new Error('Required beneficiary and guardian consent is incomplete.')
      const matches = possibleDuplicates(input, state).filter((record) => record.id !== id)
      if (matches.length && !confirmDistinct)
        throw new Error(
          `Possible duplicate: ${matches.map((record) => record.code).join(', ')}. Review and confirm this is a distinct person.`,
        )
      const prior = state.beneficiaries.find((record) => record.id === id)
      const age =
        input.age ?? (input.birthDate ? Math.max(0, 2026 - Number(input.birthDate.slice(0, 4))) : 0)
      const ageGroup: BeneficiaryRecord['ageGroup'] =
        age < 15 ? '10-14' : age < 18 ? '15-17' : age < 25 ? '18-24' : '25+'
      const record: BeneficiaryRecord = {
        ...(prior ?? {
          id: nextId(state, 'beneficiary'),
          enrollments: [],
          participation: [],
          assessments: [],
          notes: [],
          enrollmentStatus: 'Active' as const,
        }),
        ...input,
        displayName: `${input.firstName} ${input.lastName}`,
        location: `${input.barangay}, ${input.city}, ${input.province}`,
        ageGroup,
        projectIds: Array.from(new Set([...(prior?.projectIds ?? []), input.projectId])),
        enrollments: prior?.enrollments.some((row) => row.projectId === input.projectId)
          ? prior.enrollments
          : [
              ...(prior?.enrollments ?? []),
              {
                id: nextId(state, 'enrollment'),
                projectId: input.projectId,
                status: 'Active',
                enrolledAt: demoTime(state).slice(0, 10),
                followUpStatus: 'Not due',
              },
            ],
      }
      state.beneficiaries = [...state.beneficiaries.filter((row) => row.id !== record.id), record]
      return record
    },
  )
}

export function addBeneficiaryNote(
  beneficiaryId: string,
  stageId: string,
  visibility: BeneficiaryNoteRecord['visibility'],
  note: string,
) {
  const record = getDemoState().beneficiaries.find((row) => row.id === beneficiaryId)
  return transactDemo(
    'beneficiaries.edit',
    record?.projectIds[0],
    beneficiaryId,
    (state, actor) => {
      if (!note.trim()) throw new Error('Add a note before saving.')
      const beneficiary = state.beneficiaries.find((row) => row.id === beneficiaryId)
      if (!beneficiary) throw new Error('Beneficiary not found.')
      beneficiary.notes.unshift({
        id: nextId(state, 'note'),
        beneficiaryId,
        projectId: beneficiary.projectIds[0],
        stageId,
        author: actor.name,
        createdAt: demoTime(state).slice(0, 10),
        visibility,
        note: note.trim(),
      })
    },
  )
}

export function recordBeneficiaryParticipation(
  beneficiaryId: string,
  input: Pick<
    BeneficiaryParticipationRecord,
    'activityId' | 'participatedAt' | 'attendanceStatus' | 'note'
  >,
) {
  const state = getDemoState()
  const beneficiary = state.beneficiaries.find((row) => row.id === beneficiaryId)
  const activity = state.activities.find((row) => row.id === input.activityId)
  return transactDemo(
    'beneficiaries.edit',
    activity?.projectId ?? beneficiary?.projectIds[0],
    beneficiaryId,
    (draft) => {
      if (!activity || !input.participatedAt) throw new Error('Select an activity and date.')
      const target = draft.beneficiaries.find((row) => row.id === beneficiaryId)
      if (!target) throw new Error('Beneficiary not found.')
      target.participation.push({
        id: nextId(draft, 'participation'),
        beneficiaryId,
        projectId: activity.projectId,
        ...input,
      })
      const project = draft.projects.find((row) => row.id === activity.projectId)
      if (project)
        project.beneficiariesReached = new Set(
          draft.beneficiaries
            .filter((row) => row.projectIds.includes(project.id) && row.participation.length)
            .map((row) => row.id),
        ).size
    },
  )
}

export function setBeneficiaryStatus(beneficiaryId: string, status: BeneficiaryEnrollmentStatus) {
  const record = getDemoState().beneficiaries.find((row) => row.id === beneficiaryId)
  return transactDemo('beneficiaries.edit', record?.projectIds[0], beneficiaryId, (state) => {
    const beneficiary = state.beneficiaries.find((row) => row.id === beneficiaryId)
    if (!beneficiary) throw new Error('Beneficiary not found.')
    beneficiary.enrollmentStatus = status
    beneficiary.enrollments = beneficiary.enrollments.map((row) => ({ ...row, status }))
  })
}

export function saveJourneyStages(projectId: string, stages: JourneyStageConfig[]) {
  return transactDemo('journeys.review', projectId, projectId, (state) => {
    if (
      !stages.length ||
      stages.some((stage) => !stage.code.trim() || !stage.name.trim() || stage.order < 1)
    )
      throw new Error('Each journey stage needs a code, name, and positive order.')
    if (new Set(stages.map((stage) => stage.code.toLowerCase())).size !== stages.length)
      throw new Error('Journey stage codes must be unique within the project.')
    if (
      stages.some(
        (stage) =>
          stage.parentStageId && !stages.some((parent) => parent.id === stage.parentStageId),
      )
    )
      throw new Error('A branch references a missing parent stage.')
    state.journeys = [
      ...state.journeys.filter((stage) => stage.projectId !== projectId),
      ...structuredClone(stages),
    ]
  })
}

export function resolveDuplicate(leftId: string, rightId: string, decision: 'link' | 'distinct') {
  const left = getDemoState().beneficiaries.find((row) => row.id === leftId)
  return transactDemo(
    'beneficiaries.merge',
    left?.projectIds[0],
    `${leftId}:${rightId}`,
    (state) => {
      const a = state.beneficiaries.find((row) => row.id === leftId)
      const b = state.beneficiaries.find((row) => row.id === rightId)
      if (!a || !b) throw new Error('Both beneficiary profiles must exist.')
      if (decision === 'distinct') {
        const decisions = state.decisionHistory[leftId] ?? []
        decisions.push({
          id: nextId(state, 'duplicate'),
          at: demoTime(state),
          actor: currentAccount(state)?.name ?? 'Unknown',
          state: 'Distinct',
          note: `${rightId} reviewed and retained as a separate person.`,
        })
        state.decisionHistory[leftId] = decisions
        return
      }
      a.projectIds = Array.from(new Set([...a.projectIds, ...b.projectIds]))
      a.enrollments.push(...b.enrollments)
      a.participation.push(...b.participation)
      a.assessments.push(...b.assessments)
      a.notes.push(...b.notes)
      state.beneficiaries = state.beneficiaries.filter((row) => row.id !== rightId)
    },
  )
}
