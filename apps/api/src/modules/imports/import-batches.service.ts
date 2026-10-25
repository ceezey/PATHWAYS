import { NotFoundException } from '@nestjs/common'
import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports/server'
import type {
  ImportBatchDetailResponse,
  ImportMappingResponse,
  ImportRowResponse,
  ImportRowsPageResponse,
  ImportRowsQuery,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { readBatchCoverage } from './batch-coverage'
import { safeSourceColumns } from './imports.helpers'
import { type BatchRow, batchSelection, mapBatch } from './imports.mapper'

export async function listProjectBatches(tx: Tx, actor: ApplicationIdentity, projectId: string) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  const batches = await tx.dataImportBatch.findMany({
    where: { organizationId: actor.organizationId, projectId: scopedProjectId },
    select: batchSelection,
    orderBy: { createdAt: 'desc' },
    take: IMPORT_ENGINEERING_LIMITS.processingCheckpointRows,
  })
  const warnings = await warningRowCounts(
    tx,
    actor,
    batches.map((batch) => batch.id),
  )
  return batches.map((batch) => mapBatch(batch, warnings.get(batch.id) ?? 0, actor.userId))
}

/** Rows with at least one stored validation warning, per batch. */
async function warningRowCounts(tx: Tx, actor: ApplicationIdentity, batchIds: string[]) {
  if (batchIds.length === 0) return new Map<string, number>()
  const counts = await tx.$queryRaw<Array<{ batchId: string; warnings: number }>>(Prisma.sql`
      SELECT import_batch_id::text AS "batchId", count(*)::int AS warnings
      FROM pathways.data_import_rows
      WHERE organization_id=${actor.organizationId}::uuid
        AND import_batch_id=ANY(${batchIds}::uuid[])
        AND validation_warnings <> '[]'::jsonb
      GROUP BY import_batch_id
    `)
  return new Map(counts.map((entry) => [entry.batchId, entry.warnings]))
}

const warningRows = async (tx: Tx, actor: ApplicationIdentity, batchId: string) =>
  (await warningRowCounts(tx, actor, [batchId])).get(batchId) ?? 0

export async function readBatchDetail(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
): Promise<ImportBatchDetailResponse> {
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
      dateOrder: true,
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
    ...mapBatch(batch, await warningRows(tx, actor, batch.id), actor.userId),
    ...(await registrationCounts(tx, actor, batch)),
    sourceHeaders: sourceColumns.map((column) => column.key),
    sourceColumns,
    mappings: mappings.map(
      (mapping): ImportMappingResponse => ({
        ...mapping,
        valueMap: mapping.valueMap as ImportMappingResponse['valueMap'],
        dateOrder: mapping.dateOrder as ImportMappingResponse['dateOrder'],
      }),
    ),
    coverage: await readBatchCoverage(tx, actor, batch, mappings),
  }
}

export async function readBatchRows(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  query: ImportRowsQuery,
): Promise<ImportRowsPageResponse> {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  const scope = {
    organizationId: actor.organizationId,
    projectId: batch.projectId,
    importBatchId: batch.id,
  }
  // Held rows wait for a person: unprocessed rows with a reason, and invalid registration rows a reviewer can resolve.
  const where = query.held
    ? {
        ...scope,
        OR: [
          { status: 'UNPROCESSED' as const, processingErrorCode: { not: null } },
          ...(batch.form.formType === 'BENEFICIARY_REGISTRATION'
            ? [{ status: 'INVALID' as const }]
            : []),
        ],
      }
    : scope
  const total = query.held ? await tx.dataImportRow.count({ where }) : batch.totalRows
  const rows = await tx.dataImportRow.findMany({
    where,
    select: {
      id: true,
      rowNumber: true,
      rawData: true,
      status: true,
      validationErrors: true,
      validationWarnings: true,
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
    total,
    rows: rows.map(
      (row): ImportRowResponse => ({
        ...row,
        rawData: row.rawData as ImportRowResponse['rawData'],
        validationErrors: row.validationErrors as ImportRowResponse['validationErrors'],
        validationWarnings: row.validationWarnings as ImportRowResponse['validationWarnings'],
        updatedAt: row.updatedAt.toISOString(),
      }),
    ),
  }
}

export async function mapStoredBatch(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  return {
    ...mapBatch(batch, await warningRows(tx, actor, batch.id), actor.userId),
    ...(await registrationCounts(tx, actor, batch)),
  }
}

/** Processed registration rows by outcome, for registration batches only; LINKED counts as updated. */
async function registrationCounts(tx: Tx, actor: ApplicationIdentity, batch: BatchRow) {
  if (batch.form.formType !== 'BENEFICIARY_REGISTRATION') return {}
  const groups = await tx.dataImportRow.groupBy({
    by: ['registrationOutcome'],
    where: { organizationId: actor.organizationId, importBatchId: batch.id },
    _count: { _all: true },
  })
  const count = (...outcomes: string[]) =>
    groups
      .filter((group) => group.registrationOutcome && outcomes.includes(group.registrationOutcome))
      .reduce((sum, group) => sum + group._count._all, 0)
  return {
    registrationCounts: {
      created: count('CREATED'),
      updated: count('UPDATED', 'LINKED'),
      unchanged: count('UNCHANGED'),
    },
  }
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
      createdAt: true,
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
