import { ConflictException } from '@nestjs/common'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { requireBatchWithHeaders } from './import-batches.service'
import type {
  PromotionContext,
  PromotionHandlers,
  PromotionKind,
} from './import-promotion-context.service'
import {
  promoteGenericInTx,
  promoteParticipationInTx,
  promoteRegistrationInTx,
} from './import-row-promotion.service'

/**
 * Promotes up to processingCheckpointRows claimed rows in one verified transaction.
 * Identity, account, organization, role, permission and project assignment are
 * re-verified once for the chunk; every row keeps its claim, revision and
 * idempotency checks. Any failure rolls back the whole chunk.
 */
export async function promoteChunkRows(
  tx: Tx,
  actor: ApplicationIdentity,
  promotion: PromotionHandlers,
  projectId: string,
  claimId: string,
  validationRevision: number,
  kind: PromotionKind,
  context: PromotionContext,
  rowIds: string[],
) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  const current = await tx.dataImportBatch.findFirst({
    where: {
      id: context.batch.id,
      organizationId: actor.organizationId,
      projectId: scopedProjectId,
    },
    select: {
      formId: true,
      formVersion: true,
      status: true,
      processingClaimId: true,
      mappingRevision: true,
      validationRevision: true,
      validatedMappingRevision: true,
      reviewedById: true,
    },
  })
  if (
    !current ||
    scopedProjectId !== context.batch.projectId ||
    current.status !== 'PROCESSING' ||
    current.processingClaimId !== claimId ||
    current.validationRevision !== validationRevision ||
    current.validatedMappingRevision !== current.mappingRevision ||
    current.mappingRevision !== context.batch.mappingRevision ||
    current.validationRevision !== context.batch.validationRevision ||
    current.reviewedById !== context.batch.reviewedById ||
    current.formId !== context.batch.formId ||
    current.formVersion !== context.batch.formVersion
  ) {
    throw new ConflictException('The processing claim or validation revision is stale.')
  }
  for (const rowId of rowIds) {
    if (kind === 'REGISTRATION') {
      await promoteRegistrationInTx(tx, actor, promotion, context, rowId, claimId)
    } else if (kind === 'PARTICIPATION') {
      await promoteParticipationInTx(tx, actor, promotion, context, rowId, claimId)
    } else {
      await promoteGenericInTx(tx, actor, context, rowId, claimId)
    }
  }
}

export async function promoteClaimedRegistrationRow(
  tx: Tx,
  actor: ApplicationIdentity,
  promotion: PromotionHandlers,
  projectId: string,
  batchId: string,
  rowId: string,
  claimId: string,
  validationRevision: number,
) {
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (
    batch.status !== 'PROCESSING' ||
    batch.processingClaimId !== claimId ||
    batch.validationRevision !== validationRevision ||
    batch.validatedMappingRevision !== batch.mappingRevision ||
    !batch.reviewedById ||
    batch.form.formType !== 'BENEFICIARY_REGISTRATION'
  ) {
    throw new ConflictException('The registration processing claim is stale.')
  }
  await promoteRegistrationInTx(
    tx,
    actor,
    promotion,
    { batch: { ...batch, reviewedById: batch.reviewedById } },
    rowId,
    claimId,
  )
}

export async function promoteClaimedParticipationRow(
  tx: Tx,
  actor: ApplicationIdentity,
  promotion: PromotionHandlers,
  projectId: string,
  batchId: string,
  rowId: string,
  claimId: string,
  validationRevision: number,
) {
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (
    batch.status !== 'PROCESSING' ||
    batch.processingClaimId !== claimId ||
    batch.validationRevision !== validationRevision ||
    batch.validatedMappingRevision !== batch.mappingRevision ||
    !batch.reviewedById ||
    batch.form.formType !== 'ACTIVITY_MONITORING'
  )
    throw new ConflictException('The participation processing claim is stale.')
  await promoteParticipationInTx(
    tx,
    actor,
    promotion,
    { batch: { ...batch, reviewedById: batch.reviewedById } },
    rowId,
    claimId,
  )
}

export async function promoteClaimedGenericRow(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  rowId: string,
  claimId: string,
  validationRevision: number,
) {
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (
    batch.status !== 'PROCESSING' ||
    batch.processingClaimId !== claimId ||
    batch.validationRevision !== validationRevision ||
    batch.validatedMappingRevision !== batch.mappingRevision ||
    !batch.reviewedById
  ) {
    throw new ConflictException('The processing claim or validation revision is stale.')
  }
  await promoteGenericInTx(
    tx,
    actor,
    { batch: { ...batch, reviewedById: batch.reviewedById } },
    rowId,
    claimId,
  )
}
