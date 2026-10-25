import { randomUUID } from 'node:crypto'
import { ConflictException } from '@nestjs/common'
import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports/server'
import type { ProcessImportRequest } from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { lockBatch, mapStoredBatch, requireBatchWithHeaders } from './import-batches.service'
import {
  type PromotionContext,
  type PromotionHandlers,
  loadPromotionContext,
} from './import-promotion-context.service'

export interface ProcessingClaim {
  complete: boolean
  rowIds: string[]
  claimId: string
  registrationHandler: boolean
  participationHandler: boolean
  context?: PromotionContext
}

export async function claimBatchRows(
  tx: Tx,
  actor: ApplicationIdentity,
  promotion: PromotionHandlers,
  projectId: string,
  batchId: string,
  input: ProcessImportRequest,
): Promise<ProcessingClaim> {
  await lockBatch(tx, actor, projectId, batchId)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (
    batch.validationRevision !== input.expectedValidationRevision ||
    batch.validatedMappingRevision !== batch.mappingRevision
  ) {
    throw new ConflictException('The current mapping has not been validated.')
  }
  if (batch.status === 'PROCESSED') {
    return {
      complete: true,
      rowIds: [],
      claimId: '',
      registrationHandler: false,
      participationHandler: false,
    }
  }
  if (!['VALIDATED', 'PARTIALLY_PROCESSED', 'PROCESSING'].includes(batch.status)) {
    throw new ConflictException('This import is not ready for processing.')
  }
  const expiry = new Date(Date.now() - IMPORT_ENGINEERING_LIMITS.processingClaimMilliseconds)
  if (batch.processingClaimId && batch.processingClaimedAt && batch.processingClaimedAt > expiry) {
    throw new ConflictException('Another worker currently owns this import claim.')
  }
  await tx.dataImportRow.updateMany({
    where: {
      importBatchId: batch.id,
      status: 'PROCESSING',
      processingClaimedAt: { lt: expiry },
      processingAttempts: { lt: IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts },
    },
    data: { status: 'VALID', processingClaimId: null, processingClaimedAt: null },
  })
  await tx.dataImportRow.updateMany({
    where: {
      importBatchId: batch.id,
      status: 'PROCESSING',
      processingClaimedAt: { lt: expiry },
      processingAttempts: { gte: IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts },
    },
    data: {
      status: 'FAILED',
      processingClaimId: null,
      processingClaimedAt: null,
      processingErrorCode: 'RETRY_LIMIT_EXCEEDED',
    },
  })
  const candidates = await tx.dataImportRow.findMany({
    where: {
      organizationId: actor.organizationId,
      importBatchId: batch.id,
      status: 'VALID',
      mappingRevision: batch.mappingRevision,
      validationRevision: batch.validationRevision,
      processingAttempts: { lt: IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts },
    },
    select: { id: true },
    orderBy: { rowNumber: 'asc' },
    take: IMPORT_ENGINEERING_LIMITS.processingClaimRows,
  })
  if (candidates.length === 0) {
    await reconcileBatch(tx, batch.id)
    return {
      complete: true,
      rowIds: [],
      claimId: '',
      registrationHandler: false,
      participationHandler: false,
    }
  }
  const claimId = randomUUID()
  const claimedAt = new Date()
  const rowIds = candidates.map((row) => row.id)
  const claimed = await tx.dataImportRow.updateMany({
    where: { id: { in: rowIds }, status: 'VALID' },
    data: {
      status: 'PROCESSING',
      processingClaimId: claimId,
      processingClaimedAt: claimedAt,
      processingAttempts: { increment: 1 },
      processingErrorCode: null,
    },
  })
  if (claimed.count !== rowIds.length) {
    throw new ConflictException('The processing claim changed concurrently.')
  }
  await tx.dataImportBatch.update({
    where: { id: batch.id },
    data: {
      status: 'PROCESSING',
      processingRevision: { increment: 1 },
      processingClaimId: claimId,
      processingClaimedAt: claimedAt,
      failureCode: null,
    },
  })
  return {
    complete: false,
    rowIds,
    claimId,
    registrationHandler: batch.form.formType === 'BENEFICIARY_REGISTRATION',
    participationHandler: batch.form.formType === 'ACTIVITY_MONITORING',
    context: await loadPromotionContext(tx, actor, promotion, batch),
  }
}

export async function releaseClaimedRow(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  rowId: string,
  claimId: string,
) {
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  const row = await tx.dataImportRow.findFirst({
    where: {
      id: rowId,
      organizationId: actor.organizationId,
      importBatchId: batch.id,
      status: 'PROCESSING',
      processingClaimId: claimId,
    },
    select: { id: true, processingAttempts: true },
  })
  if (!row) return
  await tx.dataImportRow.update({
    where: { id: row.id },
    data: {
      status:
        row.processingAttempts >= IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts
          ? 'FAILED'
          : 'VALID',
      processingClaimId: null,
      processingClaimedAt: null,
      processingErrorCode:
        row.processingAttempts >= IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts
          ? 'RETRY_LIMIT_EXCEEDED'
          : 'RETRY_PENDING',
    },
  })
}

export async function finishBatchClaim(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  claimId: string,
) {
  await lockBatch(tx, actor, projectId, batchId)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (batch.processingClaimId !== claimId) {
    throw new ConflictException('The processing claim changed concurrently.')
  }
  // Reconcile the status, counters, and claim release atomically. While a batch
  // is PROCESSING, the database state contract requires its claim fields to
  // remain populated; clearing them in a separate UPDATE creates a transient
  // invalid row and fails the checkpoint before reconciliation can run.
  await reconcileBatch(tx, batch.id)
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_PROCESSING_CHECKPOINT',
    entityType: 'DataImportBatch',
    entityId: batch.id,
    changes: { processingRevision: batch.processingRevision },
  })
  return mapStoredBatch(tx, actor, batch.projectId, batch.id)
}

export async function reconcileBatch(tx: Tx, batchId: string) {
  const counts = await tx.dataImportRow.groupBy({
    by: ['status'],
    where: { importBatchId: batchId },
    _count: { _all: true },
  })
  const count = (status: string) =>
    counts.find((entry) => entry.status === status)?._count._all ?? 0
  const processed = count('PROCESSED')
  const unprocessed = count('UNPROCESSED')
  const failed = count('FAILED')
  const invalid = count('INVALID')
  const outstanding = count('VALID') + count('PROCESSING') + count('PENDING')
  const status =
    outstanding > 0
      ? 'PARTIALLY_PROCESSED'
      : invalid + unprocessed + failed > 0
        ? 'PARTIALLY_PROCESSED'
        : 'PROCESSED'
  await tx.dataImportBatch.update({
    where: { id: batchId },
    data: {
      status,
      processedRows: processed,
      unprocessedRows: unprocessed,
      failedRows: failed,
      invalidRows: invalid,
      processingClaimId: null,
      processingClaimedAt: null,
      processedAt: outstanding === 0 ? new Date() : null,
    },
  })
}
