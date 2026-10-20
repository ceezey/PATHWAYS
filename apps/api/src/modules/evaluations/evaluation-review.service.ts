import { ConflictException, ForbiddenException } from '@nestjs/common'
import {
  type ReturnEvaluationRequest,
  type SignOffEvaluationRequest,
  hasAtomicPermission,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { readDetail, requireEvaluation } from './evaluation-detail.service'

// Reopens a submitted evaluation as a draft with its return reason; scores stay untouched.
export async function returnEvaluation(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  evaluationId: string,
  body: ReturnEvaluationRequest,
) {
  const id = await requireScopedProject(tx, actor, projectId)
  const evaluation = await requireEvaluation(tx, actor, id, evaluationId)
  if (evaluation.status !== 'SUBMITTED')
    throw new ConflictException('This evaluation changed; reload before retrying.')
  if (evaluation.updatedAt.toISOString() !== body.expectedUpdatedAt)
    throw new ConflictException('This evaluation changed; reload before retrying.')
  const now = new Date()
  const changed = await tx.projectEvaluation.updateMany({
    where: {
      organizationId: actor.organizationId,
      projectId: id,
      id: evaluationId,
      status: 'SUBMITTED',
      updatedAt: evaluation.updatedAt,
    },
    data: {
      status: 'DRAFT',
      evaluatedAt: null,
      overallScore: null,
      returnReason: body.reason,
      updatedAt: now,
    },
  })
  if (changed.count !== 1)
    throw new ConflictException('This evaluation changed; reload before retrying.')
  await writeAuditLog(tx, actor, {
    projectId: id,
    action: 'EVALUATION_RETURNED',
    entityType: 'ProjectEvaluation',
    entityId: evaluationId,
    changes: { reason: body.reason },
  })
  return readDetail(tx, actor, id, evaluationId)
}

// Reviews and signs off a submitted evaluation as two guarded transitions in one transaction.
export async function signOffEvaluation(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  evaluationId: string,
  body: SignOffEvaluationRequest,
) {
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'evaluations.signoff'))
    throw new ForbiddenException('Sign-off is unavailable for your role.')
  const id = await requireScopedProject(tx, actor, projectId)
  const evaluation = await requireEvaluation(tx, actor, id, evaluationId)
  if (evaluation.status !== 'SUBMITTED')
    throw new ConflictException('This evaluation changed; reload before retrying.')
  if (evaluation.updatedAt.toISOString() !== body.expectedUpdatedAt)
    throw new ConflictException('This evaluation changed; reload before retrying.')
  if (evaluation.evaluatedById === actor.userId)
    throw new ForbiddenException('The evaluator cannot sign off their own evaluation.')
  const reviewedAt = new Date()
  const reviewed = await tx.projectEvaluation.updateMany({
    where: {
      organizationId: actor.organizationId,
      projectId: id,
      id: evaluationId,
      status: 'SUBMITTED',
      updatedAt: evaluation.updatedAt,
    },
    data: {
      status: 'REVIEWED',
      reviewedById: actor.userId,
      reviewedAt,
      reviewFeedback: body.feedback,
      updatedAt: reviewedAt,
    },
  })
  if (reviewed.count !== 1)
    throw new ConflictException('This evaluation changed; reload before retrying.')
  const signedOffAt = new Date()
  const signed = await tx.projectEvaluation.updateMany({
    where: {
      organizationId: actor.organizationId,
      projectId: id,
      id: evaluationId,
      status: 'REVIEWED',
      updatedAt: reviewedAt,
    },
    data: {
      status: 'SIGNED_OFF',
      signedOffById: actor.userId,
      signedOffAt,
      updatedAt: signedOffAt,
    },
  })
  if (signed.count !== 1)
    throw new ConflictException('This evaluation changed; reload before retrying.')
  await writeAuditLog(tx, actor, {
    projectId: id,
    action: 'EVALUATION_REVIEWED',
    entityType: 'ProjectEvaluation',
    entityId: evaluationId,
    changes: { feedback: body.feedback },
  })
  await writeAuditLog(tx, actor, {
    projectId: id,
    action: 'EVALUATION_SIGNED_OFF',
    entityType: 'ProjectEvaluation',
    entityId: evaluationId,
    changes: {},
  })
  return readDetail(tx, actor, id, evaluationId)
}
