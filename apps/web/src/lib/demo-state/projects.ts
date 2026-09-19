import type {
  Activity,
  ActivityProof,
  ActivityStatus,
  CreateProjectInput,
  Indicator,
  SubmitActivityProofInput,
} from '@/types/pathways'
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

const proofProgress = (activity: Activity, proof: ActivityProof) =>
  proof.progress ?? activity.progress

const latestProof = (activity: Activity) => activity.submittedProof.at(-1)

const incompleteStatus = (
  state: DemoState,
  activity: Activity,
  progress: number,
): ActivityStatus => {
  if (Date.parse(`${activity.dueDate}T23:59:59.999Z`) < state.clock) return 'Overdue'
  return progress > 0 ? 'In Progress' : 'Planned'
}

export function submitActivityProof(input: SubmitActivityProofInput) {
  const activity = getDemoState().activities.find((record) => record.id === input.activityId)
  return transactDemo('proof.submit', activity?.projectId, input.activityId, (state, actor) => {
    const record = state.activities.find((candidate) => candidate.id === input.activityId)
    if (!record) throw new Error('Activity not found.')
    if (record.status === 'Completed') throw new Error('Completed activities are read-only.')
    if (!input.note.trim()) throw new Error('Enter an update note before submitting proof.')
    const remainingBeneficiaries = Math.max(
      0,
      record.targetBeneficiaries - record.beneficiariesReached,
    )
    const hasSessionCount = input.beneficiariesReachedThisSession !== undefined
    const sessionCount = input.beneficiariesReachedThisSession ?? 0
    const legacyProgress = input.progress ?? Number.NaN
    if (
      hasSessionCount &&
      (!Number.isInteger(sessionCount) || sessionCount < 0 || sessionCount > remainingBeneficiaries)
    )
      throw new Error(
        `Beneficiaries reached this session must be a whole number between 0 and ${remainingBeneficiaries}.`,
      )
    if (
      !hasSessionCount &&
      (!Number.isFinite(legacyProgress) || legacyProgress < 0 || legacyProgress > 100)
    )
      throw new Error('Progress must be between 0 and 100 percent.')
    if (!input.fileNames.length) throw new Error('Attach at least one proof-of-conduct file.')

    for (const earlierProof of record.submittedProof) {
      if (earlierProof.status === 'Submitted' || earlierProof.status === 'Validated') {
        earlierProof.status = 'Superseded'
        earlierProof.returnReason = 'Superseded by a newer Project Officer submission.'
      }
    }

    const version =
      record.submittedProof.reduce((highest, proof, index) => {
        const candidate = proof.version ?? index + 1
        return Math.max(highest, candidate)
      }, 0) + 1
    const submittedAt = demoTime(state)
    const priorActivityStatus =
      record.status === 'For Review'
        ? incompleteStatus(state, record, record.progress)
        : record.status
    const beneficiariesReachedTotal = hasSessionCount
      ? record.beneficiariesReached + sessionCount
      : record.beneficiariesReached
    const calculatedProgress = hasSessionCount
      ? Math.min(
          100,
          Math.round((beneficiariesReachedTotal / Math.max(1, record.targetBeneficiaries)) * 100),
        )
      : legacyProgress
    const proof: ActivityProof = {
      id: nextId(state, `proof-${record.id}`),
      fileName: input.fileNames[0] ?? 'Progress update note',
      fileNames: [...input.fileNames],
      files: input.files ? structuredClone(input.files) : undefined,
      status: 'Submitted',
      submittedAt,
      submittedBy: actor.id,
      progress: calculatedProgress,
      beneficiariesReachedThisSession: hasSessionCount ? sessionCount : undefined,
      beneficiariesReachedTotal: hasSessionCount ? beneficiariesReachedTotal : undefined,
      version,
      priorActivityStatus,
      note: input.note.trim(),
    }

    // The proposed values remain on the exact proof version until M&E validates it.
    // This prevents an unreviewed submission from changing the activity record.
    record.correctionReason = ''
    record.submittedProof.push(proof)

    return structuredClone(record)
  })
}

export function validateActivityProof(activityId: string, proofId: string) {
  const activity = getDemoState().activities.find((record) => record.id === activityId)
  return transactDemo('proof.validate', activity?.projectId, proofId, (state, actor) => {
    const record = state.activities.find((candidate) => candidate.id === activityId)
    if (!record) throw new Error('Activity not found.')
    const proof = record.submittedProof.find((candidate) => candidate.id === proofId)
    if (!proof) throw new Error('Proof log not found.')
    if (latestProof(record)?.id !== proof.id)
      throw new Error('This proof version is stale. Review the latest submission instead.')
    if (proof.status !== 'Submitted')
      throw new Error('Only a submitted proof log can be validated.')

    proof.status = 'Validated'
    proof.progress = proofProgress(record, proof)
    proof.version ??= record.submittedProof.indexOf(proof) + 1
    proof.priorActivityStatus ??= record.status
    proof.validatedAt = demoTime(state)
    proof.validatedBy = actor.id
    record.progress = proof.progress
    if (proof.beneficiariesReachedTotal !== undefined)
      record.beneficiariesReached = proof.beneficiariesReachedTotal
    record.status =
      proof.progress === 100 ? 'For Review' : incompleteStatus(state, record, proof.progress)
    record.progressApproval = proof.progress === 100 ? 'For Review' : undefined
    record.updateNotes.push({
      id: nextId(state, 'note'),
      note: proof.note?.trim() || 'M&E validated the submitted proof.',
      progress: proof.progress,
      submittedAt: proof.validatedAt,
    })

    for (const manager of state.accounts.filter(
      (account) =>
        account.role === 'Project Manager' && account.projectIds.includes(record.projectId),
    )) {
      notifyLocally(
        state,
        manager,
        `${record.title}: proof version ${proof.version} validated by M&E.`,
        `/projects/${record.projectId}/activities/${record.id}?review=${proof.id}`,
      )
    }

    return structuredClone(record)
  })
}

export function flagActivityProof(activityId: string, proofId: string) {
  const activity = getDemoState().activities.find((record) => record.id === activityId)
  return transactDemo('proof.validate', activity?.projectId, proofId, (state, actor) => {
    const record = state.activities.find((candidate) => candidate.id === activityId)
    if (!record) throw new Error('Activity not found.')
    const proof = record.submittedProof.find((candidate) => candidate.id === proofId)
    if (!proof) throw new Error('Proof log not found.')
    if (latestProof(record)?.id !== proof.id)
      throw new Error('This proof version is stale. Review the latest submission instead.')
    if (proof.status !== 'Submitted') throw new Error('Only a submitted proof log can be flagged.')

    proof.status = 'Flagged'
    proof.validatedAt = demoTime(state)
    proof.validatedBy = actor.id
    proof.returnReason = 'M&E marked this submission as insufficient. Submit a corrected proof.'
    record.progressApproval = 'For Correction'
    record.correctionReason = proof.returnReason
    record.status = proof.priorActivityStatus ?? incompleteStatus(state, record, record.progress)

    const submitter = proof.submittedBy
      ? state.accounts.find((account) => account.id === proof.submittedBy)
      : undefined
    if (submitter)
      notifyLocally(
        state,
        submitter,
        `${record.title}: proof version ${proof.version ?? record.submittedProof.length} was flagged as insufficient by M&E.`,
        `/projects/${record.projectId}/activities/${record.id}?proof=${proof.id}&action=correct`,
      )
    return structuredClone(record)
  })
}

export function requestActivityExtension(activityId: string) {
  const activity = getDemoState().activities.find((record) => record.id === activityId)
  return transactDemo(
    'activities.extension.request',
    activity?.projectId,
    activityId,
    (state, actor) => {
      const record = state.activities.find((candidate) => candidate.id === activityId)
      if (!record) throw new Error('Activity not found.')
      if (record.status === 'Completed')
        throw new Error('Completed activities cannot request an extension.')
      if (record.extensionRequestedAt)
        throw new Error('An extension request has already been sent for this activity.')
      record.extensionRequestedAt = demoTime(state)
      record.extensionRequestedBy = actor.id
      for (const manager of state.accounts.filter(
        (account) =>
          account.role === 'Project Manager' && account.projectIds.includes(record.projectId),
      ))
        notifyLocally(
          state,
          manager,
          `${record.title}: ${actor.name} requested a schedule extension.`,
          `/projects/${record.projectId}/activities/${record.id}`,
        )
      return structuredClone(record)
    },
  )
}

export function reviewValidatedActivityProof(
  activityId: string,
  proofId: string,
  approved: boolean,
  reason = '',
) {
  const activity = getDemoState().activities.find((record) => record.id === activityId)
  return transactDemo(
    approved ? 'proof.approve' : 'proof.return',
    activity?.projectId,
    proofId,
    (state, actor) => {
      const record = state.activities.find((candidate) => candidate.id === activityId)
      if (!record) throw new Error('Activity not found.')
      const proof = record.submittedProof.find((candidate) => candidate.id === proofId)
      if (!proof) throw new Error('Proof log not found.')
      if (latestProof(record)?.id !== proof.id)
        throw new Error('This proof version is stale. Review the latest submission instead.')
      if (proof.status !== 'Validated')
        throw new Error('Only the exact M&E-validated proof version can be decided.')
      if (!approved && !reason.trim()) throw new Error('A correction reason is required.')
      const completesActivity = approved && proofProgress(record, proof) === 100

      proof.status = approved ? 'Approved' : 'Returned'
      proof.reviewedAt = demoTime(state)
      proof.reviewedBy = actor.id
      proof.returnReason = approved ? '' : reason.trim()
      record.progressApproval = approved ? 'Approved' : 'For Correction'
      record.correctionReason = approved ? '' : reason.trim()
      record.status = approved
        ? completesActivity
          ? 'Completed'
          : incompleteStatus(state, record, proofProgress(record, proof))
        : (proof.priorActivityStatus ?? incompleteStatus(state, record, record.progress))
      record.updateNotes.push({
        id: nextId(state, 'review'),
        note: approved
          ? completesActivity
            ? `Proof version ${proof.version ?? record.submittedProof.length} approved and completed.`
            : `Proof version ${proof.version ?? record.submittedProof.length} approved.`
          : `Proof version ${proof.version ?? record.submittedProof.length} returned: ${reason.trim()}`,
        progress: proofProgress(record, proof),
        submittedAt: demoTime(state),
      })

      const submitter = proof.submittedBy
        ? state.accounts.find((account) => account.id === proof.submittedBy)
        : state.accounts.find(
            (account) =>
              account.role === 'Project Officer' &&
              account.projectIds.includes(record.projectId) &&
              record.assignedTo.includes(account.name),
          )
      if (submitter) {
        notifyLocally(
          state,
          submitter,
          approved
            ? `${record.title}: proof version ${proof.version ?? record.submittedProof.length} approved.`
            : `${record.title}: proof version ${proof.version ?? record.submittedProof.length} returned for revision. ${reason.trim()}`,
          `/projects/${record.projectId}/activities/${record.id}`,
        )
      }

      return structuredClone(record)
    },
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
      status: 'For Verification',
      reason: '',
      counted: false,
      submittedBy: actor.id,
    }
    state.expenses = [...state.expenses.filter((e) => e.id !== id), expense]
    for (const reviewer of state.accounts.filter(
      (account) =>
        account.role === 'Monitoring and Evaluation Officer' &&
        account.projectIds.includes(input.projectId),
    ))
      notifyLocally(
        state,
        reviewer,
        `${actor.name} submitted ${input.category} expense for validation.`,
        `/projects/${input.projectId}/activities/${input.activityId}?expense=${expense.id}`,
      )
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

export type ExpenseDecision = 'Approve' | 'Reject' | 'Partial' | 'Escalate'

const countApprovedExpense = (state: DemoState, expense: DemoExpense, approvedAmount: number) => {
  if (expense.counted) throw new Error('This expense decision has already updated the budget.')
  const budget = state.budgets.find((record) => record.projectId === expense.projectId)
  if (!budget || approvedAmount > budget.plannedAmount - budget.actualSpending)
    throw new Error('Available budget changed. Review the expense before deciding again.')

  budget.actualSpending += approvedAmount
  expense.counted = true
  expense.approvedAmount = approvedAmount
  expense.rejectedAmount = expense.amount - approvedAmount

  const project = state.projects.find((record) => record.id === expense.projectId)
  if (!project) throw new Error('Linked project is unavailable.')
  project.budgetUtilization = Math.round((budget.actualSpending / budget.plannedAmount) * 100)

  const activity = state.activities.find((record) => record.id === expense.activityId)
  if (activity) activity.budgetLogged += approvedAmount
}

export function decideExpense(
  id: string,
  decision: ExpenseDecision,
  options: { approvedAmount?: number; reason?: string } = {},
) {
  const snapshot = getDemoState().expenses.find((expense) => expense.id === id)
  const action = snapshot?.status === 'Escalated' ? 'expenses.escalation_decide' : 'expenses.review'

  return transactDemo(action, snapshot?.projectId, id, (state, actor) => {
    const expense = state.expenses.find((record) => record.id === id)
    if (!expense) throw new Error('Expense not found.')
    const isEscalationDecision = expense.status === 'Escalated'

    if (isEscalationDecision) {
      if (actor.role !== 'Program Manager')
        throw new Error('Only the Program Manager can decide an escalated expense.')
      if (decision === 'Escalate') throw new Error('An escalated expense needs a final decision.')
    } else {
      if (expense.status !== 'Pending Review')
        throw new Error('Only pending expenses can be reviewed.')
      if (actor.role !== 'Project Manager')
        throw new Error('Only the Project Manager can review a submitted expense.')
    }

    if (expense.submittedBy === actor.id) throw new Error('You cannot review your own expense.')

    const reason = options.reason?.trim() ?? ''
    if (decision !== 'Approve' && !reason) throw new Error(`${decision} requires a reason.`)

    if (decision === 'Partial') {
      const approvedAmount = options.approvedAmount
      if (
        approvedAmount === undefined ||
        !Number.isFinite(approvedAmount) ||
        approvedAmount <= 0 ||
        approvedAmount >= expense.amount
      )
        throw new Error(
          'Partial approval must be greater than zero and less than the submitted amount.',
        )
      countApprovedExpense(state, expense, approvedAmount)
      expense.status = 'Partially Approved'
    } else if (decision === 'Approve') {
      countApprovedExpense(state, expense, expense.amount)
      expense.status = 'Approved'
    } else if (decision === 'Reject') {
      expense.approvedAmount = 0
      expense.rejectedAmount = expense.amount
      expense.status = 'Rejected'
    } else {
      expense.approvedAmount = 0
      expense.rejectedAmount = expense.amount
      expense.status = 'Escalated'
    }

    expense.reason = reason
    expense.reviewedBy = actor.id
    expense.reviewedAt = demoTime(state)

    if (decision === 'Escalate') {
      const programManager = state.accounts.find(
        (account) =>
          account.role === 'Program Manager' && account.projectIds.includes(expense.projectId),
      )
      if (programManager)
        notifyLocally(
          state,
          programManager,
          `Expense ${expense.id} was escalated for your decision. ${reason}`,
          `/projects/${expense.projectId}/budget`,
        )
    }

    const submitter = state.accounts.find((account) => account.id === expense.submittedBy)
    if (submitter)
      notifyLocally(
        state,
        submitter,
        `Expense ${expense.id}: ${expense.status}.${reason ? ` ${reason}` : ''}`,
        `/projects/${expense.projectId}/activities/${expense.activityId}`,
      )

    return structuredClone(expense)
  })
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
export type MultiProjectIndicatorInput = Pick<
  Indicator,
  'label' | 'description' | 'unit' | 'disaggregation' | 'dataSource' | 'target'
>

export function saveIndicatorForProjects(
  input: MultiProjectIndicatorInput,
  projectIds: string[],
  sourceId?: string,
) {
  const selectedProjectIds = [...new Set(projectIds)]
  return transactDemo('indicators.manage', selectedProjectIds[0], sourceId, (state, actor) => {
    if (!selectedProjectIds.length) throw new Error('Select at least one authorized project.')
    if (
      ![input.label, input.description, input.unit, input.disaggregation, input.dataSource].every(
        (value) => value?.trim(),
      )
    )
      throw new Error(
        'Name, description, unit, disaggregation requirements and data source are required.',
      )
    if (!Number.isFinite(input.target) || input.target < 0)
      throw new Error('Target must be a non-negative number.')

    const source = sourceId ? state.indicators.find((indicator) => indicator.id === sourceId) : null
    if (sourceId && !source) throw new Error('The indicator being edited is no longer available.')
    if (source) assertAction(actor, 'indicators.manage', source.projectId)

    for (const projectId of selectedProjectIds) {
      if (!state.projects.some((project) => project.id === projectId && !project.archived))
        throw new Error('Every selected project must be active and available.')
      assertAction(actor, 'indicators.manage', projectId)
    }

    const code = source?.code ?? `IND-${state.sequence + 1}`
    const duplicateCopies = selectedProjectIds.filter(
      (projectId) =>
        state.indicators.filter(
          (indicator) => indicator.projectId === projectId && indicator.code === code,
        ).length > 1,
    )
    if (duplicateCopies.length)
      throw new Error('Duplicate project indicator copies must be resolved before saving.')

    const saved = selectedProjectIds.map((projectId) => {
      const existing = state.indicators.find(
        (indicator) => indicator.projectId === projectId && indicator.code === code,
      )
      const record: Indicator = {
        ...input,
        id: existing?.id ?? nextId(state, 'indicator'),
        projectId,
        code,
        actual: existing?.actual ?? 0,
      }
      state.indicators = [
        ...state.indicators.filter((indicator) => indicator.id !== record.id),
        record,
      ]

      const measured = state.projectIndicators.find(
        (indicator) => indicator.projectId === projectId && indicator.code === code,
      )
      state.projectIndicators = [
        ...state.projectIndicators.filter((indicator) => indicator.id !== measured?.id),
        {
          id: measured?.id ?? nextId(state, 'project-indicator'),
          projectId,
          code,
          label: input.label,
          baseline: measured?.baseline ?? 0,
          target: input.target,
          actual: measured?.actual ?? 0,
          status: measured?.status ?? 'On Track',
          connectedActivityIds: measured?.connectedActivityIds ?? [],
        },
      ]
      return record
    })

    return structuredClone(saved)
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
