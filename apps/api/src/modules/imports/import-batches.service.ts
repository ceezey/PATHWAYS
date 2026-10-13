import { NotFoundException } from '@nestjs/common'
import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports/server'
import type { ImportRowsQuery } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { safeSourceColumns } from './imports.helpers'
import { batchSelection, mapBatch } from './imports.mapper'

export async function listProjectBatches(tx: Tx, actor: ApplicationIdentity, projectId: string) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  const batches = await tx.dataImportBatch.findMany({
    where: { organizationId: actor.organizationId, projectId: scopedProjectId },
    select: batchSelection,
    orderBy: { createdAt: 'desc' },
    take: IMPORT_ENGINEERING_LIMITS.processingCheckpointRows,
  })
  return batches.map(mapBatch)
}

export async function readBatchDetail(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  const mappings = await tx.metadataMapping.findMany({
    where: { importBatchId: batch.id, revision: batch.mappingRevision },
    select: {
      sourceFieldName: true,
      status: true,
      revision: true,
      targetField: { select: { code: true, label: true } },
      validationMessage: true,
      suggestedField: { select: { code: true, label: true } },
      matchScore: true,
      matchReason: true,
      dataType: true,
      valueMap: true,
    },
    orderBy: { sourceFieldName: 'asc' },
    take: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
  })
  const stored = await tx.dataImportBatch.findUnique({
    where: { id: batch.id },
    select: { sourceHeaders: true },
  })
  const sourceColumns = stored ? safeSourceColumns(stored.sourceHeaders) : []
  return {
    ...mapBatch(batch),
    sourceHeaders: sourceColumns.map((column) => column.key),
    sourceColumns,
    mappings,
  }
}

export async function readBatchRows(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  query: ImportRowsQuery,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  const rows = await tx.dataImportRow.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      importBatchId: batch.id,
    },
    select: {
      id: true,
      rowNumber: true,
      rawData: true,
      status: true,
      validationErrors: true,
      mappingRevision: true,
      validationRevision: true,
      processingAttempts: true,
      processingErrorCode: true,
      updatedAt: true,
    },
    orderBy: { rowNumber: 'asc' },
    skip: query.offset,
    take: query.take,
  })
  return {
    offset: query.offset,
    take: query.take,
    total: batch.totalRows,
    rows: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
  }
}

export async function mapStoredBatch(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
) {
  return mapBatch(await requireBatch(tx, actor, projectId, batchId))
}

export async function lockBatch(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
) {
  if (![projectId, batchId].every((value) => UUID_PATTERN.test(value))) {
    throw new NotFoundException('Import batch unavailable.')
  }
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text FROM pathways.data_import_batches
      WHERE id=${batchId.toLowerCase()}::uuid
        AND organization_id=${actor.organizationId}::uuid
        AND project_id=${projectId.toLowerCase()}::uuid
      FOR UPDATE
    `)
  if (rows.length !== 1) throw new NotFoundException('Import batch unavailable.')
}

export async function requireBatch(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  if (!UUID_PATTERN.test(batchId)) throw new NotFoundException('Import batch unavailable.')
  const batch = await tx.dataImportBatch.findFirst({
    where: {
      id: batchId.toLowerCase(),
      organizationId: actor.organizationId,
      projectId: scopedProjectId,
    },
    select: batchSelection,
  })
  if (!batch) throw new NotFoundException('Import batch unavailable.')
  return batch
}

export async function requireBatchWithHeaders(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  const stored = await tx.dataImportBatch.findUnique({
    where: { id: batch.id },
    select: {
      ...batchSelection,
      sourceHeaders: true,
      storageBucket: true,
      storageObjectKey: true,
      processingClaimId: true,
      processingClaimedAt: true,
    },
  })
  if (!stored) throw new NotFoundException('Import batch unavailable.')
  return stored
}
