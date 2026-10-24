import { createHash } from 'node:crypto'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { SupportedImportFileType } from '@pathways/imports/server'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { requireBatchWithHeaders } from './import-batches.service'

// A FAILED attempt keeps its key forever, so each re-run may spend up to this many keys.
export const RERUN_MAX_ATTEMPTS = 5

/** A v4-shaped UUID from the first 16 bytes of sha256(oldBatchId:formId:attempt), so a retry reuses its key. */
export function rerunClientImportId(batchId: string, formId: string, attempt: number) {
  const bytes = createHash('sha256')
    .update(`${batchId}:${formId}:${attempt}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Checks the uploader, the batch state and the target version, then returns the stored source to copy. */
export async function readRerunSource(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  formId: string,
) {
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (batch.uploadedById !== actor.userId) throw new ForbiddenException('Re-run is unavailable.')
  if (!['UPLOADED', 'MAPPED'].includes(batch.status)) {
    throw new ConflictException('This import can no longer be re-run.')
  }
  const newest = await tx.digitalForm.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      code: batch.form.code,
      status: 'PUBLISHED',
    },
    orderBy: { version: 'desc' },
    select: { id: true, version: true },
  })
  if (!newest || newest.id !== formId.toLowerCase() || newest.version <= batch.formVersion) {
    throw new ConflictException('The form is not a newer published version of this import.')
  }
  const clientImportId = await firstUsableKey(tx, actor, batch.id, newest.id)
  return {
    clientImportId,
    storageBucket: batch.storageBucket,
    storageObjectKey: batch.storageObjectKey,
    sourceChecksum: batch.sourceChecksum,
    originalFileName: batch.originalFileName,
    sourceSheetName: batch.sourceSheetName,
    fileType: batch.fileType as SupportedImportFileType,
    formVersion: newest.version,
  }
}

// The first attempt key with no batch or a non-FAILED batch, so a retry resumes and a failure moves on.
async function firstUsableKey(tx: Tx, actor: ApplicationIdentity, batchId: string, formId: string) {
  for (let attempt = 0; attempt < RERUN_MAX_ATTEMPTS; attempt += 1) {
    const clientImportId = rerunClientImportId(batchId, formId, attempt)
    const existing = await tx.dataImportBatch.findFirst({
      where: { organizationId: actor.organizationId, uploadedById: actor.userId, clientImportId },
      select: { status: true },
    })
    if (existing?.status !== 'FAILED') return clientImportId
  }
  throw new ConflictException('The re-run failed repeatedly; upload the file again.')
}

/** Links the old and new batch once; a retry that returns the same new batch adds no second row. */
export async function recordRerun(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  sourceBatchId: string,
  newBatchId: string,
  formVersion: number,
) {
  const existing = await tx.auditLog.findFirst({
    where: {
      organizationId: actor.organizationId,
      action: 'IMPORT_RERUN',
      entityType: 'DataImportBatch',
      entityId: newBatchId,
    },
    select: { id: true },
  })
  if (existing) return
  await writeAuditLog(tx, actor, {
    projectId,
    action: 'IMPORT_RERUN',
    entityType: 'DataImportBatch',
    entityId: newBatchId,
    changes: { sourceBatchId, newBatchId, formVersion },
  })
}
