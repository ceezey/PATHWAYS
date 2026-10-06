import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../auth/developer-access'
import { projectStatusSource } from './report-project-status-source'

const projectId = 'abcdefab-0000-4000-8000-000000000001'
const cell = (value: string | null, state = 'AVAILABLE', reason: string | null = null) => ({
  state,
  value,
  reason,
})
const fullOverview = {
  timeline: { metric: cell('50'), startDate: '2026-01-01', endDate: '2026-12-31' },
  budgetUtilization: {
    metric: cell('40'),
    approvedBudget: '1000.00',
    countableSpending: '400.00',
  },
  kpiAchievement: { metric: cell('45'), indicatorCount: 2, reportedCount: 2 },
  beneficiariesReached: { metric: cell(null, 'SUPPRESSED', 'SMALL_CELL'), target: 100 },
}
const indicator = {
  code: 'IND-1',
  name: 'Trained farmers',
  baseline: '0',
  target: '100',
  current: cell('50'),
  progress: cell('50'),
}
const alert = (title: string, severity: string, lifecycle = 'NEW') => ({
  title,
  severity,
  lifecycle,
  explanation: 'Explained.',
  evaluatedAt: '2026-10-05T01:00:00.000Z',
})
const deps = {
  overview: { readInTransaction: vi.fn() },
  dashboards: { monitoringInTransaction: vi.fn() },
  rules: { listAlertsInTransaction: vi.fn() },
}
const tx = { projectMilestone: { findMany: vi.fn() } }
const project = {
  code: 'SYN',
  title: 'Fictional project',
  status: 'ACTIVE',
  implementationArea: 'Region X',
  sector: 'Health',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-12-31'),
  implementingPartners: 'Partner A',
  programManager: { fullName: 'Maria Santos' },
}
const all = [
  'activities.read',
  'monitoring.read',
  'alerts.read',
  'indicators.read',
  'budgets.read',
  'expenses.read',
]
const run = (permissions: string[] = all) =>
  projectStatusSource(
    deps as never,
    tx as never,
    { roles: ['PROJECT_MANAGER'], permissions } as unknown as ApplicationIdentity,
    projectId,
    project,
  )

describe('project status source', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deps.overview.readInTransaction.mockResolvedValue(fullOverview)
    deps.dashboards.monitoringInTransaction.mockResolvedValue({ indicators: [indicator] })
    deps.rules.listAlertsInTransaction.mockResolvedValue({
      items: [
        alert('Low one', 'LOW'),
        alert('Closed', 'CRITICAL', 'RESOLVED'),
        alert('Critical one', 'CRITICAL', 'REVIEWED'),
      ],
      nextCursor: null,
    })
    tx.projectMilestone.findMany.mockResolvedValue([
      {
        title: 'Kickoff',
        status: 'PENDING',
        targetDate: new Date('2020-01-01'),
        completionDate: null,
      },
    ])
  })
  it('returns every section for a full-permission actor', async () => {
    const { sections, unavailableReasons } = await run()
    expect(unavailableReasons).toEqual([])
    expect(sections.information.manager).toBe('Maria Santos')
    expect(sections.keyFigures?.map((f) => f.label)).toEqual([
      'Timeline elapsed',
      'Budget used',
      'KPI achievement',
      'Beneficiaries reached',
    ])
    expect(sections.milestones?.[0]).toMatchObject({ title: 'Kickoff', overdue: true })
    expect(sections.indicators?.[0]).toMatchObject({ code: 'IND-1', progress: '50%' })
    expect(sections.alerts?.map((a) => a.title)).toEqual(['Critical one', 'Low one'])
    expect(sections.overview.map((o) => o.area)).toEqual(['Schedule', 'Budget', 'Indicators'])
  })
  it('keeps a suppressed figure suppressed instead of zero', async () => {
    const { sections } = await run()
    const reached = sections.keyFigures?.find((f) => f.label === 'Beneficiaries reached')
    expect(reached).toMatchObject({ state: 'SUPPRESSED', value: null })
  })
  it('omits each section and says why when its permission is missing', async () => {
    const { sections, unavailableReasons } = await run([])
    expect(sections.milestones).toBeUndefined()
    expect(sections.indicators).toBeUndefined()
    expect(sections.alerts).toBeUndefined()
    expect(tx.projectMilestone.findMany).not.toHaveBeenCalled()
    expect(deps.dashboards.monitoringInTransaction).not.toHaveBeenCalled()
    expect(deps.rules.listAlertsInTransaction).not.toHaveBeenCalled()
    expect(unavailableReasons.length).toBeGreaterThanOrEqual(3)
  })
  it('marks overview rows not available when inputs are hidden', async () => {
    deps.overview.readInTransaction.mockResolvedValue({
      ...fullOverview,
      budgetUtilization: null,
      kpiAchievement: null,
      beneficiariesReached: null,
    })
    const { sections } = await run([])
    expect(sections.overview.map((o) => o.status)).toEqual([
      'NOT_AVAILABLE',
      'NOT_AVAILABLE',
      'NOT_AVAILABLE',
    ])
  })
  it('notes missing project dates for the indicator section', async () => {
    const { sections, unavailableReasons } = await projectStatusSource(
      deps as never,
      tx as never,
      { roles: ['PROJECT_MANAGER'], permissions: all } as unknown as ApplicationIdentity,
      projectId,
      { ...project, startDate: null },
    )
    expect(sections.indicators).toBeUndefined()
    expect(unavailableReasons.join(' ')).toContain('project dates')
  })
})
