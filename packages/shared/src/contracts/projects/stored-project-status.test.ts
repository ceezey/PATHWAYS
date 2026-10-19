import { describe, expect, it } from 'vitest'
import { metricObservationSchema } from '../../rules/rule-contract'
import { budgetObservation, timelineObservation } from '../../rules/rule-metrics'
import { ROLE_OVERVIEW_CONTRACT_VERSION, roleOverviewSchema } from '../dashboards/role-overview'
import { storedProjectStatuses } from './project-requests'

const statuses = ['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED']
const enumError = `Invalid enum value. Expected ${statuses.map((s) => `'${s}'`).join(' | ')}, received 'ARCHIVED'`
const scope = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  projectId: '20000000-0000-4000-8000-000000000002',
}
const context = { scope, conditionId: 'A', asOf: '2026-09-26T00:00:00.000Z', revision: '1' }

// First issue message of a schema or calculator that throws, or null when it accepts.
function rejection(run: () => unknown): string | null {
  try {
    run()
    return null
  } catch (error) {
    return (error as { issues: Array<{ message: string }> }).issues[0].message
  }
}

const overview = (status: string) =>
  roleOverviewSchema.parse({
    contractVersion: ROLE_OVERVIEW_CONTRACT_VERSION,
    businessDate: '2026-10-04',
    projects: [
      {
        id: scope.projectId,
        code: 'P-1',
        title: 'Project',
        status,
        programName: null,
        managerName: null,
      },
    ],
    myActivities: null,
    flaggedProof: null,
    recentSubmissions: null,
    submittedThisMonth: null,
    proofQueue: null,
    approvalQueue: null,
    myExtensions: null,
    extensionQueue: null,
    escalationQueue: null,
    datasetsImportedThisMonth: null,
    alerts: null,
  })

const timeline = (projectStatus: string) =>
  timelineObservation({
    ...context,
    metric: 'PROJECT_REMAINING_DAYS',
    reportingDate: '2026-09-26',
    startDate: '2026-09-20',
    endDate: '2026-09-30',
    projectStatus,
    projectArchived: false,
  })

const budget = (projectStatus: string) =>
  budgetObservation({
    ...context,
    projectStatus,
    projectArchived: false,
    recordCount: 2,
    currencyCount: 1,
    plannedTotal: '200',
    approvedExpenseTotal: '50',
  })

const calculation = (projectStatus: string) =>
  metricObservationSchema.parse({
    ...timeline('ONGOING'),
    calculation: { ...timeline('ONGOING').calculation, projectStatus },
  })

describe('stored project status copies', () => {
  it('shares one list of five codes', () => {
    expect(storedProjectStatuses).toEqual(statuses)
  })

  it.each(statuses)(
    'accepts %s in the role overview, rule calculations and aggregates',
    (status) => {
      expect(overview(status).projects[0].status).toBe(status)
      expect(timeline(status).source?.kind).toBe('PROJECT')
      expect(rejection(() => calculation(status))).toBeNull()
      expect(rejection(() => budget(status))).toBeNull()
    },
  )

  it.each([
    ['role overview', overview],
    ['timeline observation', timeline],
    ['rule calculation', calculation],
    ['aggregate observation', budget],
  ] as const)('rejects an unknown status in the %s with the enum message', (_name, run) => {
    expect(rejection(() => run('ARCHIVED'))).toBe(enumError)
  })
})
