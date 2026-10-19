import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { projectScope } from '../../common/authz/project-scope'
import type { Tx } from '../../common/prisma/transaction'
import { day, rows } from './role-overview.helpers'

export async function proofQueue(tx: Tx, actor: ApplicationIdentity) {
  // Matches the review queue and refuses self-review like the review endpoint.
  const where = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    status: 'PENDING' as const,
    submittedById: { not: actor.userId },
    evidenceMedia_update: { some: {}, none: { storageReady: false } },
  }
  const [count, found] = await Promise.all([
    tx.activityUpdate.count({ where }),
    tx.activityUpdate.findMany({
      where,
      select: {
        id: true,
        activityId: true,
        projectId: true,
        progressPercent: true,
        submittedAt: true,
        project: { select: { title: true } },
        activity: { select: { code: true, title: true } },
        submittedBy: { select: { fullName: true } },
      },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((u) => ({
      updateId: u.id,
      activityId: u.activityId,
      projectId: u.projectId,
      projectTitle: u.project.title,
      activityCode: u.activity.code,
      activityTitle: u.activity.title,
      submitterName: u.submittedBy.fullName,
      submittedAt: u.submittedAt.toISOString(),
      progress: u.progressPercent,
    })),
  }
}

export async function approvalQueue(tx: Tx, actor: ApplicationIdentity) {
  const where = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    status: 'VERIFIED' as const,
    submittedById: { not: actor.userId },
    NOT: { verifiedById: actor.userId },
  }
  const [count, found] = await Promise.all([
    tx.budgetExpenseEntry.count({ where }),
    tx.budgetExpenseEntry.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        description: true,
        amount: true,
        verifiedAt: true,
        project: { select: { title: true } },
        verifiedBy: { select: { fullName: true } },
        budgetRecord: { select: { activityId: true } },
      },
      orderBy: [{ verifiedAt: 'asc' }, { id: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((e) => ({
      expenseId: e.id,
      activityId: e.budgetRecord.activityId ?? null,
      projectId: e.projectId,
      projectTitle: e.project.title,
      description: e.description.slice(0, 300),
      amount: e.amount.toFixed(2),
      verifiedByName: e.verifiedBy?.fullName ?? null,
      verifiedAt: e.verifiedAt?.toISOString() ?? null,
    })),
  }
}

export async function myExtensions(tx: Tx, actor: ApplicationIdentity) {
  const where = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    requestedById: actor.userId,
  }
  const [count, found] = await Promise.all([
    tx.activityExtensionRequest.count({ where }),
    tx.activityExtensionRequest.findMany({
      where,
      select: {
        id: true,
        activityId: true,
        projectId: true,
        requestedEndDate: true,
        status: true,
        verificationNote: true,
        decisionNote: true,
        activity: { select: { code: true, title: true } },
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((e) => ({
      id: e.id,
      activityId: e.activityId,
      projectId: e.projectId,
      activityCode: e.activity.code.slice(0, 64),
      activityTitle: e.activity.title.slice(0, 200),
      requestedEndDate: day(e.requestedEndDate) as string,
      status: e.status as 'PENDING' | 'VERIFIED' | 'RETURNED' | 'APPROVED' | 'DECLINED',
      note:
        (e.status === 'RETURNED'
          ? e.verificationNote
          : e.status === 'DECLINED'
            ? e.decisionNote
            : null
        )?.slice(0, 2000) ?? null,
    })),
  }
}

// M&E verifies PENDING rows and the Project Manager decides VERIFIED rows, never their own.
export async function extensionQueue(
  tx: Tx,
  actor: ApplicationIdentity,
  stage: 'VERIFY' | 'DECIDE',
) {
  const where = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    requestedById: { not: actor.userId },
    ...(stage === 'VERIFY'
      ? { status: 'PENDING' }
      : { status: 'VERIFIED', NOT: { verifiedById: actor.userId } }),
  }
  const [count, found] = await Promise.all([
    tx.activityExtensionRequest.count({ where }),
    tx.activityExtensionRequest.findMany({
      where,
      select: {
        id: true,
        activityId: true,
        projectId: true,
        requestedEndDate: true,
        currentEndDate: true,
        reason: true,
        project: { select: { title: true } },
        activity: { select: { code: true, title: true } },
        requestedBy: { select: { fullName: true } },
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((e) => ({
      id: e.id,
      activityId: e.activityId,
      projectId: e.projectId,
      projectTitle: e.project.title.slice(0, 200),
      activityCode: e.activity.code.slice(0, 64),
      activityTitle: e.activity.title.slice(0, 200),
      requesterName: e.requestedBy.fullName.slice(0, 200),
      requestedEndDate: day(e.requestedEndDate) as string,
      currentEndDate: day(e.currentEndDate),
      reason: e.reason.slice(0, 2000),
      stage,
    })),
  }
}
