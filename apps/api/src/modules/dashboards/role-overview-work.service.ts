import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { projectScope } from '../../common/authz/project-scope'
import type { Tx } from '../../common/prisma/transaction'
import { day, rows } from './role-overview.helpers'

export async function projects(tx: Tx, actor: ApplicationIdentity, detail: boolean) {
  const found = await tx.project.findMany({
    where: projectScope(actor),
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      program: { select: { name: true } },
      userProjectAssignment_project: {
        // Same active PROJECT_MANAGER assignment shape as the projects service.
        where: { status: 'ACTIVE', endedAt: null, user: { role: { code: 'PROJECT_MANAGER' } } },
        select: { user: { select: { fullName: true } } },
        orderBy: { id: 'asc' },
        take: 1,
      },
    },
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    take: 20,
  })
  return found.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title,
    status: p.status,
    programName: detail ? (p.program?.name ?? null) : null,
    managerName: detail ? (p.userProjectAssignment_project[0]?.user.fullName ?? null) : null,
  }))
}

export async function myActivities(tx: Tx, actor: ApplicationIdentity, today: Date) {
  const where = {
    organizationId: actor.organizationId,
    archivedAt: null,
    project: projectScope(actor),
    status: { notIn: ['COMPLETED', 'CANCELLED'] as Array<'COMPLETED' | 'CANCELLED'> },
    projectActivityAssignment_activity: {
      some: {
        status: 'ACTIVE' as const,
        projectAssignment: { userId: actor.userId, status: 'ACTIVE' as const },
      },
    },
  }
  const [count, found] = await Promise.all([
    tx.projectActivity.count({ where }),
    tx.projectActivity.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        code: true,
        title: true,
        status: true,
        plannedEndDate: true,
        progressPercent: true,
        project: { select: { title: true } },
      },
      orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      projectTitle: a.project.title,
      code: a.code,
      title: a.title,
      status: a.status,
      // Same overdue rule as action counts: planned end before today and not closed.
      overdue: Boolean(a.plannedEndDate && a.plannedEndDate < today && a.status !== 'COMPLETED'),
      plannedEndDate: day(a.plannedEndDate),
      progress: a.progressPercent,
    })),
  }
}

export async function flaggedProof(tx: Tx, actor: ApplicationIdentity) {
  const where = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    submittedById: actor.userId,
    status: 'REJECTED' as const,
    activity: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] as Array<'COMPLETED' | 'CANCELLED'> },
    },
  }
  const candidates = await tx.activityUpdate.findMany({
    where,
    select: {
      id: true,
      activityId: true,
      projectId: true,
      reviewReason: true,
      reviewedAt: true,
      submittedAt: true,
      activity: { select: { code: true, title: true } },
    },
    orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
    take: 50,
  })
  // A resubmission is a newer update on the same activity, which clears the flag.
  const later = candidates.length
    ? await tx.activityUpdate.findMany({
        where: {
          organizationId: actor.organizationId,
          project: projectScope(actor),
          submittedById: actor.userId,
          activityId: { in: candidates.map((u) => u.activityId) },
          submittedAt: {
            gt: new Date(Math.min(...candidates.map((u) => u.submittedAt.getTime()))),
          },
        },
        select: { activityId: true, submittedAt: true },
      })
    : []
  const open = candidates.filter(
    (u) => !later.some((l) => l.activityId === u.activityId && l.submittedAt > u.submittedAt),
  )
  return {
    count: open.length,
    rows: open.slice(0, rows).map((u) => ({
      updateId: u.id,
      activityId: u.activityId,
      projectId: u.projectId,
      activityCode: u.activity.code,
      activityTitle: u.activity.title.slice(0, 200),
      reviewReason: (u.reviewReason ?? '').slice(0, 1000),
      reviewedAt: (u.reviewedAt ?? new Date(0)).toISOString(),
    })),
  }
}

export async function submissions(
  tx: Tx,
  actor: ApplicationIdentity,
  monthStart: Date,
  withExpenses: boolean,
) {
  const own = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    submittedById: actor.userId,
  }
  const [updates, expenses, updateCount, expenseCount] = await Promise.all([
    tx.activityUpdate.findMany({
      where: own,
      select: {
        id: true,
        projectId: true,
        activityId: true,
        progressPercent: true,
        status: true,
        submittedAt: true,
        activity: { select: { title: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      take: rows,
    }),
    withExpenses
      ? tx.budgetExpenseEntry.findMany({
          where: own,
          select: {
            id: true,
            projectId: true,
            description: true,
            amount: true,
            status: true,
            submittedAt: true,
            budgetRecord: { select: { activityId: true } },
          },
          orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
          take: rows,
        })
      : [],
    tx.activityUpdate.count({ where: { ...own, submittedAt: { gte: monthStart } } }),
    withExpenses
      ? tx.budgetExpenseEntry.count({ where: { ...own, submittedAt: { gte: monthStart } } })
      : 0,
  ])
  const merged = [
    ...updates.map((u) => ({
      kind: 'UPDATE' as const,
      id: u.id,
      projectId: u.projectId,
      activityId: u.activityId,
      label: u.activity.title.slice(0, 300),
      amount: null,
      progress: u.progressPercent,
      status: u.status,
      submittedAt: u.submittedAt.toISOString(),
    })),
    ...expenses.map((e) => ({
      kind: 'EXPENSE' as const,
      id: e.id,
      projectId: e.projectId,
      activityId: e.budgetRecord.activityId ?? null,
      label: e.description.slice(0, 300),
      amount: e.amount.toFixed(2),
      progress: null,
      status: e.status,
      submittedAt: e.submittedAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, rows)
  return {
    recent: { count: merged.length, rows: merged },
    month: { updates: updateCount, expenses: expenseCount },
  }
}
