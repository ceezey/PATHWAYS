import { publicPrototypeAccounts } from '@/lib/auth/prototype-accounts'
import {
  mockActivities,
  mockAlerts,
  mockBeneficiaryRecords,
  mockBudgets,
  mockExpenses,
  mockIndicators,
  mockJourneyStages,
  mockProjectIndicators,
  mockProjects,
  mockPublicProjects,
  mockRecommendations,
  mockRules,
  mockSurveyForms,
} from '@/mocks/pathways'
import type { PrototypeRole } from '@/types/prototype-role'
import { type DemoAction, type DemoActor, assertAction } from './permissions'

export const DEMO_KEY = 'pathways.demo.v1'
export const DEMO_PASSWORD = 'PathwaysDemo!2026'
export const demoPolicy = {
  resetMinutes: 15,
  passwordMin: 12,
  passwordMax: 64,
  pinMinutes: 10,
  sadddMissingPercent: 25,
  exportMaxBytes: 5 * 1024 * 1024,
  failedLoginLimit: 5,
} as const

export const demoScenarios = [
  'baseline',
  'login-unavailable',
  'retrieval-failure',
  'render-failure',
  'empty-data',
  'save-failure',
  'notification-failure',
  'import-failure',
  'export-failure',
  'export-too-large',
  'budget-unavailable',
  'backup-storage-unavailable',
  'backup-create-failure',
  'restore-failure',
  'public-maintenance',
  'public-empty',
] as const
export type DemoScenario = (typeof demoScenarios)[number]

export interface DemoAccount extends DemoActor {
  name: string
  email: string
  username: string
  password: string
  contact: string
  failedAttempts: number
  locked: boolean
}
export interface AuditEvent {
  id: string
  at: string
  actorId: string
  actor: string
  role: string
  action: string
  module: string
  entityId?: string
  projectId?: string
  outcome: 'Success' | 'Denied' | 'Failure'
  details: string
}
export interface DemoNotice {
  id: string
  at: string
  recipientId: string
  recipient: string
  message: string
  status: 'Delivered locally' | 'Delivery failed'
  href?: string
}
export interface ResetToken {
  id: string
  accountId: string
  expiresAt: number
  used: boolean
}
export interface DemoFormField {
  id: string
  label: string
  type: string
  required: boolean
  options: string[]
  code?: string
  min?: number
  max?: number
}
export interface DemoForm {
  id: string
  projectId: string
  title: string
  description: string
  status: 'Draft' | 'Published'
  fields: DemoFormField[]
  responseCount: number
  indicatorIds?: string[]
}
export interface DemoEntry {
  id: string
  projectId: string
  formId: string
  beneficiaryId: string
  activityId: string
  date: string
  values: Record<string, string>
  status: 'Draft' | 'Submitted'
  source: 'Manual' | 'Import'
  ownerId?: string
  dataType?: 'project' | 'activity' | 'participant'
}
export interface DemoReport {
  id: string
  title: string
  projectIds: string[]
  createdAt: string
  columns: string[]
  rows: string[][]
  filters: Record<string, string>
}
export interface DemoExpense {
  id: string
  projectId: string
  activityId: string
  amount: number
  category: string
  date: string
  description: string
  status: 'For Verification' | 'Verified' | 'For Correction'
  reason: string
  counted: boolean
  submittedBy: string
}
export interface Publication {
  projectId: string
  revision: number
  approvedRevision: number | null
  draft: (typeof mockPublicProjects)[number]
  published: (typeof mockPublicProjects)[number] | null
}
export interface DecisionHistory {
  id: string
  at: string
  actor: string
  state: string
  note: string
}
export type DashboardChartAnalysis = 'kpi' | 'participation' | 'survey' | 'timeline'
export type DashboardChartVisualization = 'bar' | 'line'
export type DashboardChartWidth = 'half' | 'full'
export interface DashboardChartConfig {
  id: string
  projectId: string
  analysis: DashboardChartAnalysis
  visualization: DashboardChartVisualization
  indicatorId?: string
  period: string
  width: DashboardChartWidth
  order: number
}

export function createDemoBaseline() {
  const allIds = mockProjects.map((p) => p.id)
  const accounts: DemoAccount[] = publicPrototypeAccounts.map((account) => ({
    id: account.id,
    name: account.displayName,
    email: account.email,
    username: account.username,
    role: account.role,
    password: DEMO_PASSWORD,
    contact: '09170000000',
    status: 'Active',
    failedAttempts: 0,
    locked: false,
    projectIds:
      account.role === 'Project Officer' || account.role === 'Project Manager'
        ? ['futuremakers-ncr']
        : account.role === 'Monitoring and Evaluation Officer'
          ? ['futuremakers-ncr', 'grassroots-centers-navotas']
          : allIds,
  }))
  return {
    version: 1 as const,
    teamScopeVersion: 1 as const,
    sequence: 0,
    revision: 0,
    clock: Date.UTC(2026, 8, 9, 8),
    scenario: 'baseline' as DemoScenario,
    organization: 'hdo-demo',
    organizations: [
      { id: 'hdo-demo', name: 'PATHWAYS Demo Foundation' },
      { id: 'partner-demo', name: 'Community Futures Demo' },
    ],
    session: null as { accountId: string; signedInAt: string; pinExpiresAt?: number } | null,
    accounts,
    resetTokens: [] as ResetToken[],
    projects: structuredClone(mockProjects),
    activities: structuredClone(mockActivities),
    budgets: structuredClone(mockBudgets),
    indicators: structuredClone(mockIndicators),
    projectIndicators: structuredClone(mockProjectIndicators),
    beneficiaries: structuredClone(mockBeneficiaryRecords),
    journeys: structuredClone(mockJourneyStages),
    rules: structuredClone(mockRules),
    alerts: structuredClone(mockAlerts),
    recommendations: structuredClone(mockRecommendations),
    decisionHistory: {} as Record<string, DecisionHistory[]>,
    forms: [] as DemoForm[],
    entries: [] as DemoEntry[],
    expenses: [] as DemoExpense[],
    sourceForms: structuredClone(mockSurveyForms),
    legacyExpenses: structuredClone(mockExpenses),
    reports: [] as DemoReport[],
    dashboardCharts: [] as DashboardChartConfig[],
    imports: [] as { id: string; name: string; accepted: number; rejected: number }[],
    milestones: [] as {
      id: string
      projectId: string
      title: string
      date: string
      completed: boolean
      actualDate?: string
      varianceReviewed?: boolean
    }[],
    publications: mockPublicProjects.map(
      (record): Publication => ({
        projectId: record.id,
        revision: 1,
        approvedRevision: 1,
        draft: structuredClone(record),
        published: structuredClone(record),
      }),
    ),
    audits: [] as AuditEvent[],
    notifications: [] as DemoNotice[],
    backups: [] as { id: string; at: string; name: string; payload: string; checksum: string }[],
    expenseRule: { limitPercent: 100, verificationRequired: true, adminReviewer: false },
  }
}
export type DemoState = ReturnType<typeof createDemoBaseline>
const listeners = new Set<() => void>()
let cached: DemoState | undefined
let cachedRaw: string | null | undefined
let storageError: string | null = null
const serverBaseline = createDemoBaseline()

export function validateDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false
  const state = value as DemoState
  return (
    state.version === 1 &&
    Number.isFinite(state.clock) &&
    Number.isInteger(state.sequence) &&
    Object.keys(serverBaseline).every((key) => key in state) &&
    Array.isArray(state.accounts) &&
    state.accounts.every((a) => a.id && a.email && Array.isArray(a.projectIds)) &&
    Array.isArray(state.projects) &&
    Array.isArray(state.dashboardCharts) &&
    Array.isArray(state.audits) &&
    Array.isArray(state.publications)
  )
}

export function getDemoState(): DemoState {
  if (typeof window === 'undefined') return serverBaseline
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (cached && raw === cachedRaw) return cached
    cachedRaw = raw
    if (raw) {
      const parsed = migrateDemoState(JSON.parse(raw))
      if (!validateDemoState(parsed))
        throw new Error('Unsupported or invalid demo data. Reset from review controls.')
      cached = parsed
    } else cached = createDemoBaseline()
    storageError = null
    return cached
  } catch (error) {
    storageError = error instanceof Error ? error.message : 'Browser storage is unavailable.'
    return cached ?? serverBaseline
  }
}

export function migrateDemoState(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const state = value as Record<string, unknown>
  if (state.version === 1) {
    const needsTeamScopeRepair = state.teamScopeVersion === undefined
    const projects = Array.isArray(state.projects) ? state.projects : []
    const hasFutureMakers = projects.some(
      (project) => project && typeof project === 'object' && project.id === 'futuremakers-ncr',
    )
    const accounts = Array.isArray(state.accounts)
      ? state.accounts.map((account) => {
          if (
            !needsTeamScopeRepair ||
            !hasFutureMakers ||
            !account ||
            typeof account !== 'object' ||
            account.id !== 'project-manager' ||
            !Array.isArray(account.projectIds) ||
            account.projectIds.includes('futuremakers-ncr')
          )
            return account

          return {
            ...account,
            projectIds: [...account.projectIds, 'futuremakers-ncr'],
          }
        })
      : state.accounts

    return {
      ...state,
      accounts,
      dashboardCharts: state.dashboardCharts ?? [],
      teamScopeVersion: 1,
    }
  }
  return value
}

export const getDemoStorageError = () => storageError
export const getServerDemoState = () => serverBaseline
export function subscribeDemo(listener: () => void) {
  listeners.add(listener)
  const storage = (event: StorageEvent) => {
    if (event.key === DEMO_KEY || event.key === null) listener()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', storage)
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', storage)
  }
}

/** Persist before publishing. A failed write cannot partially update the in-memory projection. */
export function commitDemo(next: DemoState) {
  if (typeof window === 'undefined') throw new Error('Demo changes require browser-local storage.')
  const raw = JSON.stringify(next)
  localStorage.setItem(DEMO_KEY, raw)
  cachedRaw = raw
  cached = next
  storageError = null
  for (const listener of listeners) listener()
}
export const nextId = (state: DemoState, prefix: string) => `${prefix}-${++state.sequence}`
export const demoTime = (state: DemoState) =>
  new Date(state.clock + state.sequence * 1000).toISOString()
export const currentAccount = (state = getDemoState()) =>
  state.accounts.find((a) => a.id === state.session?.accountId)

export function appendAudit(
  state: DemoState,
  event: Omit<AuditEvent, 'id' | 'at' | 'actorId' | 'actor' | 'role'>,
  actor = currentAccount(state),
) {
  state.audits.push({
    ...event,
    id: nextId(state, 'audit'),
    at: demoTime(state),
    actorId: actor?.id ?? 'anonymous',
    actor: actor?.name ?? 'Anonymous demo user',
    role: actor?.role ?? 'External stakeholder',
  })
}
export function notifyLocally(
  state: DemoState,
  recipient: DemoAccount,
  message: string,
  href?: string,
) {
  state.notifications.push({
    id: nextId(state, 'notice'),
    at: demoTime(state),
    recipientId: recipient.id,
    recipient: recipient.name,
    message,
    href,
    status: state.scenario === 'notification-failure' ? 'Delivery failed' : 'Delivered locally',
  })
}

export function transactDemo<T>(
  action: DemoAction,
  projectId: string | undefined,
  entityId: string | undefined,
  operation: (draft: DemoState, actor: DemoAccount) => T,
): T {
  const next = structuredClone(getDemoState())
  const actor = currentAccount(next)
  try {
    const explicitExpenseReviewer =
      actor?.role === 'System Administrator' &&
      next.expenseRule.adminReviewer &&
      (action === 'expenses.verify' || action === 'expenses.return')
    if (explicitExpenseReviewer) assertAction(actor, 'delivery.view', projectId)
    else assertAction(actor, action, projectId)
    if (next.scenario === 'save-failure')
      throw new Error(
        'Demo save failed. Your previous data is unchanged; retry after clearing the scenario.',
      )
    const result = operation(next, actor as DemoAccount)
    next.revision += 1
    appendAudit(
      next,
      {
        action,
        module: action.split('.')[0],
        projectId,
        entityId,
        outcome: 'Success',
        details: 'Browser-local change committed.',
      },
      actor,
    )
    commitDemo(next)
    return result
  } catch (error) {
    // Failure events are separate from the abandoned staged mutation.
    const failed = structuredClone(getDemoState())
    appendAudit(
      failed,
      {
        action,
        module: action.split('.')[0],
        projectId,
        entityId,
        outcome: 'Failure',
        details: error instanceof Error ? error.message : 'Action failed.',
      },
      actor,
    )
    try {
      commitDemo(failed)
    } catch {
      /* Storage failure cannot be logged to unavailable storage. */
    }
    throw error
  }
}

/** Record a read-only frontend review without manufacturing a domain mutation. */
export function recordDemoAccess(
  action: DemoAction,
  details: string,
  options: {
    projectId?: string
    entityId?: string
    outcome?: AuditEvent['outcome']
  } = {},
) {
  const next = structuredClone(getDemoState())
  const actor = currentAccount(next)
  const outcome = options.outcome ?? 'Success'

  try {
    assertAction(actor, action, options.projectId)
    appendAudit(
      next,
      {
        action,
        module: action.split('.')[0],
        projectId: options.projectId,
        entityId: options.entityId,
        outcome,
        details,
      },
      actor,
    )
  } catch (error) {
    appendAudit(
      next,
      {
        action,
        module: action.split('.')[0],
        projectId: options.projectId,
        entityId: options.entityId,
        outcome: 'Denied',
        details: error instanceof Error ? error.message : 'Access denied.',
      },
      actor,
    )
    commitDemo(next)
    throw error
  }

  commitDemo(next)
}

/** Explicit reviewer operations, not ordinary product actions. */
export function resetDemo() {
  commitDemo(createDemoBaseline())
}
export function setDemoScenario(scenario: DemoScenario) {
  if (!demoScenarios.includes(scenario)) throw new Error('Unknown scenario.')
  commitDemo({ ...getDemoState(), scenario })
}
export function switchDemoAccount(accountId: string | null) {
  const next = structuredClone(getDemoState())
  const actor = next.accounts.find((a) => a.id === accountId)
  if (accountId && (!actor || actor.status !== 'Active'))
    throw new Error('Select an active fictional account.')
  next.session = actor ? { accountId: actor.id, signedInAt: demoTime(next) } : null
  commitDemo(next)
}
export function advanceDemoClock(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 0)
    throw new Error('Enter a positive number of minutes.')
  commitDemo({ ...getDemoState(), clock: getDemoState().clock + minutes * 60_000 })
}
export const visibleDemoProjects = (state = getDemoState()) => {
  const actor = currentAccount(state)
  return state.projects.filter((project) => actor?.projectIds.includes(project.id))
}
export const actorForRole = (role: PrototypeRole, state = getDemoState()) => {
  const current = currentAccount(state)
  return current?.role === role
    ? current
    : state.accounts.find((a) => a.role === role && a.status === 'Active')
}
