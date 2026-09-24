/** Test-only conversion of frontend prototype fixtures to current API view types. */
import type { BeneficiaryRecord as LegacyBeneficiaryRecord } from '@/lib/demo-state/legacy-types'
import type { Activity, BeneficiaryRecord, UserRecord } from '@/types/pathways'

import { mockActivities } from './activities'
import { mockBeneficiaryRecords } from './beneficiaries'
import { mockUsers } from './users'

export const testActivities: Activity[] = mockActivities.map((activity) => ({
  ...activity,
  storedStatus:
    activity.status === 'Completed'
      ? 'COMPLETED'
      : activity.status === 'For Review'
        ? 'FOR_REVIEW'
        : activity.status === 'In Progress' || activity.status === 'Overdue'
          ? 'IN_PROGRESS'
          : 'NOT_STARTED',
  assignedUserIds: [],
  assignedEmails: [],
  journeyStageIds: activity.journeyStageId ? [activity.journeyStageId] : [],
  submittedProof: [],
  updateNotes: [],
  projectGoalComparison: { state: 'UNAVAILABLE', reason: 'TARGET_GOAL_UNSET' },
  updatedAt: '2026-09-01T00:00:00.000Z',
}))

export const toTestBeneficiary = (beneficiary: LegacyBeneficiaryRecord): BeneficiaryRecord => ({
  ...beneficiary,
  subjectType: 'INDIVIDUAL',
  disabilityStatus:
    beneficiary.disabilityStatus === 'Not disclosed'
      ? 'Not specified'
      : beneficiary.disabilityStatus,
  updatedAt: '2026-09-01T00:00:00.000Z',
  consentProvenance: [],
})

export const testBeneficiaries = mockBeneficiaryRecords.map(toTestBeneficiary)

export const testUsers: UserRecord[] = mockUsers.map((user) => ({
  ...user,
  signInMethod: 'Supabase account',
}))
