import type { Activity, CreateProjectInput, Indicator } from '@/types/pathways'
import { assertAction } from './permissions'
import {
  type DemoExpense,
  type DemoState,
  demoTime,
  getDemoState,
  nextId,
  notifyLocally,
  transactDemo,
} from './store'

export function saveProject(input: CreateProjectInput, id?: string) {
  return transactDemo(id ? 'projects.edit' : 'projects.create', id, id, (state, actor) => {
    const previous = state.projects.find((p) => p.id === id)
    if (id && !previous) throw new Error('Project not found.')
    if (previous?.archived)
      throw new Error('Archived projects are read-only. Unarchive before editing.')
    for (const field of [
      'title',
      'objectives',
      'area',
      'partners',
      'startDate',
      'endDate',
    ] as const) {
      if (!input[field]?.trim()) throw new Error(`${field} is required.`)
    }
    if (
      !Number.isFinite(Date.parse(input.startDate)) ||
      !Number.isFinite(Date.parse(input.endDate)) ||
      input.endDate < input.startDate
    )
      throw new Error('Choose a valid project timeline.')
    const projectBudget = input.projectBudget
    if (typeof projectBudget !== 'number' || !Number.isFinite(projectBudget) || projectBudget <= 0)
      throw new Error('Project budget must be a positive amount.')
    if (
      !input.confirmDuplicate &&
      state.projects.some(
        (p) => p.id !== id && p.title.trim().toLowerCase() === input.title.trim().toLowerCase(),
      )
    )
      throw new Error(
        'Duplicate project name. Confirm creation with the same name or revise the title.',
      )
    const recordId = id ?? nextId(state, 'project')
    const record = {
      id: recordId,
      health: 'On Track' as const,
      kpiAchievement: 0,
      beneficiariesReached: 0,
      budgetUtilization: 0,
      timelineProgress: 0,
      targetBeneficiaries: 0,
      ...previous,
      ...input,
      budgetCode: input.budgetCode ?? previous?.budgetCode ?? `PATHWAYS-${recordId.toUpperCase()}`,
      period: `${input.startDate} – ${input.endDate}`,
      createdInPrototype: previous?.createdInPrototype ?? true,
    }
    state.projects = [...state.projects.filter((p) => p.id !== id), record]
    const budget = state.budgets.find((b) => b.projectId === record.id)
    if (budget && budget.actualSpending > projectBudget)
      throw new Error('Budget cannot be less than verified spending.')
    if (budget) budget.plannedAmount = projectBudget
    else
      state.budgets.push({
        id: nextId(state, 'budget'),
        projectId: record.id,
        plannedAmount: projectBudget,
        actualSpending: 0,
      })
    if (!id) {
      const names = [
        input.programManager,
        input.projectManager,
        input.monitoringOfficer,
        ...input.projectOfficers,
      ]
      for (const account of state.accounts) {
        if (
          (account.id === actor.id ||
            account.role === 'System Administrator' ||
            names.includes(account.name)) &&
          !account.projectIds.includes(record.id)
        )
          account.projectIds.push(record.id)
      }
    }
    return record
  })
}
export function archiveProject(id: string, archived: boolean) {
  return transactDemo('projects.archive', id, id, (state) => {
    const project = state.projects.find((p) => p.id === id)
    if (!project) throw new Error('Project not found.')
    project.archived = archived
  })
}

export type ProjectTeamAssignment = {
  programManager: string
  projectManager: string
  monitoringOfficer: string
  projectOfficers: string[]
}

export function reassignProjectTeam(projectId: string, assignment: ProjectTeamAssignment) {
  return transactDemo('projects.team.manage', projectId, projectId, (state) => {
    const project = state.projects.find((record) => record.id === projectId)
    if (!project) throw new Error('Project not found.')
    if (project.archived)
      throw new Error('Archived projects are read-only. Unarchive before editing the team.')

    const selections = [
      {
        role: 'Program Manager',
        names: [assignment.programManager],
        previousNames: [project.programManager],
      },
      {
        role: 'Project Manager',
        names: [assignment.projectManager],
        previousNames: [project.projectManager],
      },
      {
        role: 'Monitoring and Evaluation Officer',
        names: [assignment.monitoringOfficer],
        previousNames: [project.monitoringOfficer],
      },
      {
        role: 'Project Officer',
        names: [...new Set(assignment.projectOfficers)],
        previousNames: project.projectOfficers,
      },
    ]

    for (const selection of selections) {
      if (selection.names.length === 0 || selection.names.some((name) => !name.trim()))
        throw new Error(`Select at least one active ${selection.role}.`)
      const eligibleNames = new Set([
        ...selection.previousNames,
        ...state.accounts
          .filter((account) => account.role === selection.role && account.status === 'Active')
          .map((account) => account.name),
      ])
      if (selection.names.some((name) => !eligibleNames.has(name)))
        throw new Error(`Select only active ${selection.role} accounts.`)
    }

    project.programManager = assignment.programManager
    project.projectManager = assignment.projectManager
    project.monitoringOfficer = assignment.monitoringOfficer
    project.projectOfficers = [...new Set(assignment.projectOfficers)]

    // Team assignment and UC004 account authorization are separate concerns. Grant newly selected
    // operational members access without revoking an existing user's authorized project scope.
    for (const selection of selections.filter((item) => item.role !== 'Program Manager')) {
      for (const account of state.accounts.filter((item) => item.role === selection.role)) {
        if (selection.names.includes(account.name))
          account.projectIds = [...new Set([...account.projectIds, projectId])]
      }
    }

    return project
  })
}
export function validateActivity(state: DemoState, activity: Activity) {
  const project = state.projects.find((p) => p.id === activity.projectId)
  if (!project || project.archived) throw new Error('Select an active project.')
  if (
    !activity.title.trim() ||
    !activity.startDate ||
    !activity.dueDate ||
    !activity.description.trim()
  )
    throw new Error('Complete required activity fields.')
  if (
    !Number.isFinite(Date.parse(activity.startDate)) ||
    !Number.isFinite(Date.parse(activity.dueDate)) ||
    activity.dueDate < activity.startDate
  )
    throw new Error('Choose valid activity dates.')
  if (
    ((project.startDate && activity.startDate < project.startDate) ||
      (project.endDate && activity.dueDate > project.endDate)) &&
    !activity.overrideJustification?.trim()
  )
    throw new Error(
      'Dates fall outside the project timeline. Provide an override justification to continue.',
    )
}
export function saveExpense(
  input: Omit<DemoExpense, 'id' | 'status' | 'reason' | 'counted' | 'submittedBy'>,
  id?: string,
) {
  return transactDemo('expenses.submit', input.projectId, id, (state, actor) => {
    const project = state.projects.find((p) => p.id === input.projectId)
    if (
      !project ||
      project.archived ||
      !state.activities.some((a) => a.id === input.activityId && a.projectId === input.projectId)
    )
      throw new Error('Link the expense to a valid project and activity.')
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      throw new Error('Expense amount must be a positive number.')
    if (
      !input.category.trim() ||
      !input.description.trim() ||
      !Number.isFinite(Date.parse(input.date))
    )
      throw new Error('Category, date and description are required.')
    const budget = state.budgets.find((b) => b.projectId === input.projectId)
    if (!budget || state.scenario === 'budget-unavailable')
      throw new Error('Project budget unavailable. Retry when the budget is available.')
    const existing = state.expenses.find((e) => e.id === id)
    if (
      id &&
      (!existing || existing.status !== 'For Correction' || existing.submittedBy !== actor.id)
    )
      throw new Error('Only your returned expense can be corrected.')
    if (
      input.amount > budget.plannedAmount - budget.actualSpending ||
      input.amount > (budget.plannedAmount * state.expenseRule.limitPercent) / 100
    )
      throw new Error('Expense violates the configured budget rule or exceeds available budget.')
    const expense: DemoExpense = {
      ...input,
      id: id ?? nextId(state, 'expense'),
      status: state.expenseRule.verificationRequired ? 'For Verification' : 'Verified',
      reason: '',
      counted: false,
      submittedBy: actor.id,
    }
    state.expenses = [...state.expenses.filter((e) => e.id !== id), expense]
    if (expense.status === 'Verified') countExpense(state, expense)
    return expense
  })
}
function countExpense(state: DemoState, expense: DemoExpense) {
  if (expense.counted) return
  const budget = state.budgets.find((b) => b.projectId === expense.projectId)
  if (!budget || expense.amount > budget.plannedAmount - budget.actualSpending)
    throw new Error('Available budget changed. Return this expense for correction.')
  budget.actualSpending += expense.amount
  expense.counted = true
  const project = state.projects.find((p) => p.id === expense.projectId)
  if (!project) throw new Error('Linked project is unavailable.')
  project.budgetUtilization = Math.round((budget.actualSpending / budget.plannedAmount) * 100)
  const activity = state.activities.find((a) => a.id === expense.activityId)
  if (activity) activity.budgetLogged += expense.amount
}
export function reviewExpense(id: string, verified: boolean, reason = '') {
  const expense = getDemoState().expenses.find((e) => e.id === id)
  return transactDemo(
    verified ? 'expenses.verify' : 'expenses.return',
    expense?.projectId,
    id,
    (state) => {
      const record = state.expenses.find((e) => e.id === id)
      if (!record || record.status !== 'For Verification')
        throw new Error('Only expenses awaiting verification can be reviewed.')
      if (!verified && !reason.trim()) throw new Error('A correction reason is required.')
      record.status = verified ? 'Verified' : 'For Correction'
      record.reason = reason
      if (verified) countExpense(state, record)
      const recipient = state.accounts.find((a) => a.id === record.submittedBy)
      if (recipient) notifyLocally(state, recipient, `Expense ${id}: ${record.status}. ${reason}`)
    },
  )
}
export function approveProgress(id: string, approved: boolean, reason = '') {
  const activity = getDemoState().activities.find((a) => a.id === id)
  return transactDemo(
    approved ? 'progress.approve' : 'progress.return',
    activity?.projectId,
    id,
    (state) => {
      const record = state.activities.find((a) => a.id === id)
      if (!record) throw new Error('Activity not found.')
      if (!approved && !reason.trim()) throw new Error('A correction reason is required.')
      record.progressApproval = approved ? 'Approved' : 'For Correction'
      record.correctionReason = reason
      if (approved && record.progress === 100) record.status = 'Completed'
      record.updateNotes.push({
        id: nextId(state, 'progress'),
        note: `${record.progressApproval}: ${reason}`,
        progress: record.progress,
        submittedAt: demoTime(state),
      })
    },
  )
}
export function saveIndicator(input: Omit<Indicator, 'id'>, id?: string) {
  return transactDemo('indicators.manage', input.projectId, id, (state) => {
    if (
      ![input.label, input.description, input.unit, input.disaggregation, input.dataSource].every(
        (s) => s?.trim(),
      )
    )
      throw new Error('Name, description, unit, disaggregation and data source are required.')
    if (!Number.isFinite(input.target) || input.target < 0)
      throw new Error('Target must be a non-negative number.')
    if (
      state.indicators.some(
        (i) => i.id !== id && i.label.trim().toLowerCase() === input.label.trim().toLowerCase(),
      )
    )
      throw new Error('Duplicate indicator name. Revise the name before saving.')
    const record = { ...input, id: id ?? nextId(state, 'indicator') }
    state.indicators = [...state.indicators.filter((i) => i.id !== id), record]
    return record
  })
}
export function reuseIndicator(id: string, projectId: string) {
  return transactDemo('indicators.manage', projectId, id, (state, actor) => {
    const source = state.indicators.find((i) => i.id === id)
    if (!source) throw new Error('Indicator not found.')
    assertAction(actor, 'indicators.manage', source.projectId)
    if (state.projectIndicators.some((i) => i.code === source.code && i.projectId === projectId))
      throw new Error('This indicator is already linked to the project.')
    state.projectIndicators.push({
      ...source,
      id: nextId(state, 'project-indicator'),
      projectId,
      baseline: 0,
      status: 'On Track',
      connectedActivityIds: [],
    })
  })
}
