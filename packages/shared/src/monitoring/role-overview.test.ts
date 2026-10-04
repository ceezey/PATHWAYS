import { describe, expect, it } from 'vitest'
import { ROLE_OVERVIEW_CONTRACT_VERSION, roleOverviewSchema } from './role-overview'

const base = {
  contractVersion: ROLE_OVERVIEW_CONTRACT_VERSION,
  businessDate: '2026-10-04',
  projects: [],
  myActivities: null,
  flaggedProof: null,
  recentSubmissions: null,
  submittedThisMonth: null,
  proofQueue: null,
  approvalQueue: null,
  datasetsImportedThisMonth: null,
  alerts: null,
}

describe('roleOverviewSchema', () => {
  it('accepts an all-null payload for a viewer without section permissions', () => {
    expect(roleOverviewSchema.parse(base)).toEqual(base)
  })
  it('rejects unknown keys so the payload cannot leak extra fields', () => {
    expect(() => roleOverviewSchema.parse({ ...base, email: 'x' })).toThrow()
  })
  it('caps list sections at 5 rows', () => {
    const row = {
      updateId: '10000000-0000-4000-8000-000000000001',
      activityId: '10000000-0000-4000-8000-000000000002',
      projectId: '10000000-0000-4000-8000-000000000003',
      projectTitle: 'P',
      activityCode: 'ACT-1',
      activityTitle: 'A',
      submitterName: 'S',
      submittedAt: '2026-10-04T00:00:00.000Z',
      progress: 50,
    }
    expect(() =>
      roleOverviewSchema.parse({ ...base, proofQueue: { count: 6, rows: Array(6).fill(row) } }),
    ).toThrow()
  })
})
