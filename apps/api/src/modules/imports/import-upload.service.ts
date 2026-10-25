import { randomUUID } from 'node:crypto'
import { ConflictException, NotFoundException } from '@nestjs/common'
import {
  IMPORT_ENGINEERING_LIMITS,
  type SupportedImportFileType,
  type parseSecureImport,
} from '@pathways/imports/server'
import type { UploadImportRequest } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import {
  lockBatch,
  mapStoredBatch,
  requireBatch,
  requireBatchWithHeaders,
} from './import-batches.service'
import { checksum, type fileMetadata, stableJson } from './imports.helpers'
import type { W10FinalizationFault } from './upload-finalization-fault'

export async function readUploadRecovery(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
) {
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (!['UPLOADING', 'RECOVERY_REQUIRED'].includes(batch.status)) {
    return { complete: true as const, batchId: batch.id }
  }
  return {
    complete: false as const,
    batchId: batch.id,
    storageBucket: batch.storageBucket,
    storageObjectKey: batch.storageObjectKey,
    fileType: batch.fileType as SupportedImportFileType,
    sourceChecksum: batch.sourceChecksum,
    sourceSheetName: batch.sourceSheetName,
  }
}

export async function reserveBatchUpload(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  input: UploadImportRequest,
  metadata: ReturnType<typeof fileMetadata>,
  uploadsBucket: string,
) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  if (!UUID_PATTERN.test(input.formId)) throw new NotFoundException('Published form unavailable.')
  const form = await tx.digitalForm.findFirst({
    where: {
      id: input.formId.toLowerCase(),
      organizationId: actor.organizationId,
      projectId: scopedProjectId,
      status: 'PUBLISHED',
    },
    select: { id: true, version: true },
  })
  if (!form) throw new NotFoundException('Published form unavailable.')
  // Only a workbook has sheets; the chosen one is kept so a resume or re-run reads the same rows.
  const sourceSheetName =
    metadata.type === 'XLSX' || metadata.type === 'XLS' ? (input.sheetName ?? null) : null
  const existing = await tx.dataImportBatch.findFirst({
    where: {
      organizationId: actor.organizationId,
      uploadedById: actor.userId,
      clientImportId: input.clientImportId.toLowerCase(),
    },
    select: {
      id: true,
      projectId: true,
      formId: true,
      formVersion: true,
      originalFileName: true,
      sourceSheetName: true,
      fileType: true,
      sourceChecksum: true,
      storageBucket: true,
      storageObjectKey: true,
      status: true,
    },
  })
  if (existing) {
    if (
      existing.projectId !== scopedProjectId ||
      existing.formId !== form.id ||
      existing.formVersion !== form.version ||
      existing.originalFileName !== metadata.name ||
      (existing.sourceSheetName ?? null) !== sourceSheetName ||
      existing.fileType !== metadata.type ||
      existing.sourceChecksum !== metadata.checksum
    ) {
      throw new ConflictException('The import idempotency key was reused for different input.')
    }
    return {
      batchId: existing.id,
      storageBucket: existing.storageBucket,
      storageObjectKey: existing.storageObjectKey,
      sourceSheetName,
      requiresFinalization: ['UPLOADING', 'RECOVERY_REQUIRED'].includes(existing.status),
    }
  }
  const id = randomUUID()
  const storageBucket = uploadsBucket
  const storageObjectKey = `organizations/${actor.organizationId}/projects/${scopedProjectId}/imports/${id}/${metadata.checksum}.${metadata.type.toLowerCase()}`
  await tx.dataImportBatch.create({
    data: {
      id,
      organizationId: actor.organizationId,
      projectId: scopedProjectId,
      formId: form.id,
      formVersion: form.version,
      sourceSystem: 'MANUAL_UPLOAD',
      originalFileName: metadata.name,
      sourceSheetName,
      fileType: metadata.type,
      sourceChecksum: metadata.checksum,
      clientImportId: input.clientImportId.toLowerCase(),
      storageBucket,
      storageObjectKey,
      uploadedById: actor.userId,
      status: 'UPLOADING',
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: scopedProjectId,
    action: 'IMPORT_UPLOAD_RESERVED',
    entityType: 'DataImportBatch',
    entityId: id,
    changes: {
      fileType: metadata.type,
      byteLength: metadata.byteLength,
      sheetChosen: sourceSheetName !== null,
    },
  })
  return {
    batchId: id,
    storageBucket,
    storageObjectKey,
    sourceSheetName,
    requiresFinalization: true,
  }
}

export async function stageUploadedRows(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  parsed: Awaited<ReturnType<typeof parseSecureImport>>,
  fault: W10FinalizationFault,
) {
  await lockBatch(tx, actor, projectId, batchId)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (batch.totalRows > 0 && batch.status !== 'RECOVERY_REQUIRED') {
    return mapStoredBatch(tx, actor, batch.projectId, batch.id)
  }
  if (!['UPLOADING', 'RECOVERY_REQUIRED'].includes(batch.status)) {
    throw new ConflictException('This upload cannot be finalized again.')
  }
  if (
    fault.consume({
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      clientImportId: batch.clientImportId,
      sourceChecksum: batch.sourceChecksum,
      storageBucket: batch.storageBucket,
      storageStatus: batch.storageStatus,
      status: batch.status,
      totalRows: batch.totalRows,
    })
  ) {
    // The authorized transaction rolls back. The upload catch records RECOVERY_REQUIRED.
    throw new Error('P07_W10_SYNTHETIC_FINALIZATION_FAILURE')
  }
  const insertSize = IMPORT_ENGINEERING_LIMITS.maxStagedRowsPerInsert
  for (let offset = 0; offset < parsed.rows.length; offset += insertSize) {
    await tx.dataImportRow.createMany({
      data: parsed.rows.slice(offset, offset + insertSize).map((row) => ({
        organizationId: actor.organizationId,
        projectId: batch.projectId,
        formId: batch.formId,
        importBatchId: batch.id,
        rowNumber: row.sourceRowNumber,
        sourceChecksum: checksum(stableJson(row.values)),
        rawData: row.values as Prisma.InputJsonValue,
      })),
    })
  }
  await tx.dataImportBatch.update({
    where: { id: batch.id },
    data: {
      storageStatus: 'STORED',
      sourceHeaders: parsed.sourceColumns as unknown as Prisma.InputJsonValue,
      status: 'UPLOADED',
      totalRows: parsed.rows.length,
      failureCode: null,
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_UPLOAD_STAGED',
    entityType: 'DataImportBatch',
    entityId: batch.id,
    changes: {
      fileType: batch.fileType,
      rows: parsed.rows.length,
      columns: parsed.sourceColumns.length,
      sheets: parsed.sheetNames.length,
    },
  })
  return mapStoredBatch(tx, actor, batch.projectId, batch.id)
}

export async function recordUploadFailure(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  failureCode: string,
  stored: boolean,
  failureMessage?: string,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  await tx.dataImportBatch.update({
    where: { id: batch.id },
    data: {
      status: 'FAILED',
      storageStatus: stored ? 'STORED' : 'FAILED',
      failureCode: failureCode.slice(0, 64),
      validationNotes: failureMessage?.slice(0, 300) ?? null,
    },
  })
}

export async function recordUploadRecoveryRequired(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  await tx.dataImportBatch.update({
    where: { id: batch.id },
    data: {
      status: 'RECOVERY_REQUIRED',
      storageStatus: 'RECOVERY_REQUIRED',
      failureCode: 'DATABASE_FINALIZATION_FAILED',
    },
  })
  return true
}
