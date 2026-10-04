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
  myExtensions: null,
  extensionQueue: null,
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
  it('rejects an escalated alert without its escalation time', () => {
    const alerts = {
      open: 0,
      capped: false,
      bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      byProject: [],
      recent: [],
      budgetOpen: 0,
      budgetRecent: [],
      escalatedOpen: 1,
      escalated: [
        {
          id: '10000000-0000-4000-8000-000000000001',
          projectId: '10000000-0000-4000-8000-000000000002',
          title: 'T',
          severity: 'HIGH',
          explanation: 'E',
          recommendation: null,
          budget: false,
        },
      ],
    }
    expect(() => roleOverviewSchema.parse({ ...base, alerts })).toThrow()
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
  it('parses a fully populated payload and a five-row list', () => {
    const u = (n: number) => `10000000-0000-4000-8000-00000000000${n}`
    const at = '2026-10-04T00:00:00.000Z'
    const alert = {
      id: u(1),
      projectId: u(2),
      title: 'T',
      severity: 'HIGH',
      explanation: 'E',
      recommendation: null,
      budget: true,
    }
    const proof = {
      updateId: u(1),
      activityId: u(2),
      projectId: u(3),
      projectTitle: 'P',
      activityCode: 'A',
      activityTitle: 'A',
      submitterName: 'S',
      submittedAt: at,
      progress: 5,
    }
    const full = {
      ...base,
      projects: [
        {
          id: u(1),
          code: 'P',
          title: 'P',
          status: 'ONGOING',
          programName: null,
          managerName: null,
        },
      ],
      myActivities: {
        count: 1,
        rows: [
          {
            id: u(1),
            projectId: u(2),
            projectTitle: 'P',
            code: 'A',
            title: 'A',
            status: 'IN_PROGRESS',
            overdue: false,
            plannedEndDate: '2026-10-05',
            progress: 10,
          },
        ],
      },
      flaggedProof: {
        count: 1,
        rows: [
          {
            updateId: u(1),
            activityId: u(2),
            projectId: u(3),
            activityCode: 'A',
            activityTitle: 'A',
            reviewReason: 'r',
            reviewedAt: at,
          },
        ],
      },
      recentSubmissions: {
        count: 1,
        rows: [
          {
            kind: 'EXPENSE',
            id: u(1),
            projectId: u(2),
            activityId: null,
            label: 'L',
            amount: '1.00',
            progress: null,
            status: 'PENDING',
            submittedAt: at,
          },
        ],
      },
      submittedThisMonth: { updates: 1, expenses: 1 },
      proofQueue: { count: 5, rows: Array(5).fill(proof) },
      approvalQueue: {
        count: 1,
        rows: [
          {
            expenseId: u(1),
            activityId: null,
            projectId: u(2),
            projectTitle: 'P',
            description: 'D',
            amount: '1.00',
            verifiedByName: null,
            verifiedAt: null,
          },
        ],
      },
      myExtensions: {
        count: 1,
        rows: [
          {
            id: u(1),
            activityId: u(2),
            projectId: u(3),
            activityCode: 'A',
            activityTitle: 'A',
            requestedEndDate: '2026-11-01',
            status: 'RETURNED',
            note: 'Attach the revised work plan.',
          },
        ],
      },
      extensionQueue: {
        count: 1,
        rows: [
          {
            id: u(1),
            activityId: u(2),
            projectId: u(3),
            projectTitle: 'P',
            activityCode: 'A',
            activityTitle: 'A',
            requesterName: 'R',
            requestedEndDate: '2026-11-01',
            currentEndDate: null,
            reason: 'Rains delayed delivery.',
            stage: 'DECIDE',
          },
        ],
      },
      datasetsImportedThisMonth: 1,
      alerts: {
        open: 1,
        capped: false,
        bySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
        byProject: [{ projectId: u(2), open: 1, maxSeverity: 'HIGH' }],
        recent: [alert],
        budgetOpen: 1,
        budgetRecent: [alert],
        escalatedOpen: 1,
        escalated: [{ ...alert, escalatedAt: at }],
      },
    }
    expect(roleOverviewSchema.parse(full)).toEqual(full)
  })
})
