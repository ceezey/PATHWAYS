import {
  type DemoExpense,
  type DemoProject,
  addDaysIso,
  demoActivities,
  demoBudgets,
  demoExpenses,
  demoProjects,
} from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { activityCode } from './local-demo-stage-activities'
import { projectOf, step, textPdf } from './local-demo-util'

type BudgetRow = { id: string; category: string; plannedBudget: string }
type ExpenseRow = {
  id: string
  description: string
  status: string
  updatedAt: string
  receiptEvidenceId: string | null
  signedOffAt: string | null
}

const projectByKey = (key: string) => demoProjects.find((p) => p.key === key) as DemoProject

/** Budget lines per project, entered by the Project Manager. */
export async function stageBudgets(ctx: DemoContext) {
  const pm = ctx.staff.projectManager.identity
  let created = 0
  for (const [key, lines] of Object.entries(demoBudgets)) {
    const project = projectByKey(key)
    const projectId = projectOf(ctx, project.key)
    const existing = (await ctx.services.finance.budgets(pm, projectId)) as BudgetRow[]
    for (const line of lines ?? []) {
      if (existing.some((row) => row.category === line.category)) continue
      let activityId: string | undefined
      if (line.activityKey) {
        const index = demoActivities[project.key].findIndex((a) => a.key === line.activityKey)
        const activity = await ctx.owner.projectActivity.findFirstOrThrow({
          where: { projectId, code: activityCode(project, index) },
          select: { id: true },
        })
        activityId = activity.id
      }
      await step(`budget ${line.category}`, () =>
        ctx.services.finance.createBudget(pm, projectId, {
          category: line.category,
          plannedBudget: line.amount,
          ...(activityId ? { activityId } : {}),
          ...(line.remarks ? { remarks: line.remarks } : {}),
        }),
      )
      created += 1
    }
  }
  ctx.log(`  budget lines created: ${created}`)
}

async function listExpenses(ctx: DemoContext, projectId: string) {
  return (await ctx.services.finance.expenses(
    ctx.staff.projectManager.identity,
    projectId,
  )) as ExpenseRow[]
}

async function findExpense(ctx: DemoContext, projectId: string, description: string) {
  const row = (await listExpenses(ctx, projectId)).find(
    (entry) => entry.description === description,
  )
  if (!row) throw new Error(`Expense "${description}" was not found.`)
  return row
}

/** Expenses at every stage of the review chain: submitted, verified by Monitoring and Evaluation,
 * approved by the Project Manager, signed off by the Program Manager, and one rejection. */
export async function stageExpenses(ctx: DemoContext) {
  let count = 0
  for (const plan of demoExpenses) {
    const project = projectByKey(plan.project)
    const projectId = projectOf(ctx, project.key)
    const submitter = ctx.staff[plan.submitter].identity
    const budgets = (await ctx.services.finance.budgets(
      ctx.staff.projectManager.identity,
      projectId,
    )) as BudgetRow[]
    const budget = budgets.find((row) => row.category === plan.budgetCategory)
    if (!budget) throw new Error(`Budget line "${plan.budgetCategory}" is missing.`)
    const already = (await listExpenses(ctx, projectId)).some(
      (row) => row.description === plan.description,
    )
    if (already) continue
    await step(`expense ${plan.description}`, () =>
      runExpense(ctx, plan, projectId, budget.id, submitter),
    )
    count += 1
  }
  ctx.log(`  expenses recorded: ${count}`)
}

async function runExpense(
  ctx: DemoContext,
  plan: DemoExpense,
  projectId: string,
  budgetRecordId: string,
  submitter: DemoContext['staff']['liza']['identity'],
) {
  const finance = ctx.services.finance
  await finance.submit(submitter, projectId, {
    clientRequestId: ctx.stable(`expense:${plan.project}:${plan.description}`),
    budgetRecordId,
    description: plan.description,
    amount: plan.amount,
    expenseDate: addDaysIso(ctx.today, -plan.daysAgo),
  })
  if (plan.receipt) {
    const row = await findExpense(ctx, projectId, plan.description)
    const bytes = textPdf('Official receipt', [
      plan.description,
      `Amount paid: PHP ${plan.amount}`,
      `Date: ${addDaysIso(ctx.today, -plan.daysAgo)}`,
      'Received with thanks.',
    ])
    await finance.uploadReceipt(
      submitter,
      projectId,
      row.id,
      { expectedUpdatedAt: row.updatedAt },
      { buffer: bytes, size: bytes.length, mimetype: 'application/pdf' },
    )
  }
  if (plan.flow === 'SUBMITTED') return
  let row = await findExpense(ctx, projectId, plan.description)
  if (plan.flow === 'REJECTED') {
    await finance.review(ctx.staff.me.identity, projectId, row.id, {
      expectedUpdatedAt: row.updatedAt,
      decision: 'REJECT',
      stage: 'VERIFY',
      reason: plan.reason ?? 'The supporting documents are incomplete.',
    })
    return
  }
  await finance.review(ctx.staff.me.identity, projectId, row.id, {
    expectedUpdatedAt: row.updatedAt,
    decision: 'VERIFY',
    stage: 'VERIFY',
  })
  if (plan.flow === 'VERIFIED') return
  row = await findExpense(ctx, projectId, plan.description)
  await finance.review(ctx.staff.projectManager.identity, projectId, row.id, {
    expectedUpdatedAt: row.updatedAt,
    decision: 'APPROVE',
    stage: 'APPROVE',
  })
  if (plan.flow === 'APPROVED') return
  row = await findExpense(ctx, projectId, plan.description)
  await finance.signoff(ctx.staff.programManager.identity, projectId, row.id)
}
