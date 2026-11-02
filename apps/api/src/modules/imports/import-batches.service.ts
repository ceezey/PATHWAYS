import { NotFoundException } from '@nestjs/common'
import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports/server'
import {
  type ImportBatchDetailResponse,
  type ImportMappingResponse,
  type ImportPartSummary,
  type ImportRowResponse,
  type ImportRowsPageResponse,
  type ImportRowsQuery,
  filePart,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { readBatchCoverage } from './batch-coverage'
import { safeSourceColumns } from './imports.helpers'
import { type BatchRow, batchSelection, mapBatch } from './imports.mapper'
import { findStageForm } from './stage-form-lookup'

export async function listProjectBatches(tx: Tx, actor: ApplicationIdentity, projectId: string) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  const batches = await tx.dataImportBatch.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: scopedProjectId,
      parentBatchId: null,
    },
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

/** Each part of a file batch with its newest form and its newest batch; a part with no batch has not been started. */
async function readPartSummaries(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: BatchRow,
): Promise<ImportPartSummary[]> {
  const parts = filePart.array().safeParse(batch.fileParts).data ?? []
  if (parts.length === 0) return []
  const children = await tx.dataImportBatch.findMany({
    where: { organizationId: actor.organizationId, parentBatchId: batch.id },
    select: batchSelection,
    orderBy: [{ formVersion: 'desc' }, { createdAt: 'desc' }],
    take: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
  })
  const warnings = await warningRowCounts(
    tx,
    actor,
    children.map((child) => child.id),
  )
  const summaries: ImportPartSummary[] = []
  for (const part of parts) {
    const form =
      (await findStageForm(tx, actor, batch.projectId, part.code, ['PUBLISHED'])) ??
      (await findStageForm(tx, actor, batch.projectId, part.code, ['DRAFT']))
    // A failed attempt only stands in when the part has no other batch.
    const ofPart = children.filter((item) => item.partCode === part.code)
    const child = ofPart.find((item) => item.status !== 'FAILED') ?? ofPart[0]
    summaries.push({
      code: part.code,
      name: part.name,
      formId: form?.id ?? null,
      formName: form?.name ?? null,
      formStatus: form ? (form.status as 'PUBLISHED' | 'DRAFT') : 'NONE',
      batch: child
        ? {
            ...mapBatch(
              child,
              warnings.get(child.id) ?? 0,
              actor.userId,
              await readWaitingRows(tx, child),
            ),
            ...registrationCounts(child, await readBatchRowCounts(tx, child.id)),
          }
        : null,
    })
  }
  return summaries
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

export type BatchRowCounts = Array<{
  status: string
  outcome: string | null
  warned: boolean
  rows: number
}>

/** The batch's rows by status, registration outcome and warning in one read, so row security runs once per row. */
export const readBatchRowCounts = (tx: Tx, batchId: string) =>
  tx.$queryRaw<BatchRowCounts>(Prisma.sql`
      SELECT status::text AS status, registration_outcome AS outcome,
        validation_warnings <> '[]'::jsonb AS warned, count(*)::int AS rows
      FROM pathways.data_import_rows
      WHERE import_batch_id=${batchId}::uuid
      GROUP BY 1, 2, 3
    `)

/** True for a row of a stage batch whose registration row, the parent row with the same number, can still become processed. */
export const waitsForParent = (parentBatchId: string) => Prisma.sql`EXISTS (
    SELECT 1 FROM pathways.data_import_rows p
    WHERE p.import_batch_id=${parentBatchId}::uuid AND p.row_number=r.row_number
      AND p.status NOT IN ('PROCESSED','FAILED'))`

/** The VALID rows of a stage batch that wait for their registration row; other batches have none. */
async function readWaitingRows(tx: Tx, batch: Pick<BatchRow, 'id' | 'parentBatchId'>) {
  if (!batch.parentBatchId) return 0
  const [counted] = await tx.$queryRaw<Array<{ waiting: number }>>(Prisma.sql`
      SELECT count(*)::int AS waiting FROM pathways.data_import_rows r
      WHERE r.import_batch_id=${batch.id}::uuid AND r.status='VALID' AND ${waitsForParent(batch.parentBatchId)}
    `)
  return counted?.waiting ?? 0
}

export const countRows = (counts: BatchRowCounts, keep: (row: BatchRowCounts[number]) => boolean) =>
  counts.reduce((sum, row) => (keep(row) ? sum + row.rows : sum), 0)

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
  const counts = await readBatchRowCounts(tx, batch.id)
  return {
    ...mapBatch(
      batch,
      countRows(counts, (row) => row.warned),
      actor.userId,
      await readWaitingRows(tx, batch),
    ),
    ...registrationCounts(batch, counts),
    parts: await readPartSummaries(tx, actor, batch),
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
  // Held rows wait for a person: unprocessed rows with a reason, and invalid registration or survey-part rows a reviewer can resolve.
  const where = query.held
    ? {
        ...scope,
        OR: [
          { status: 'UNPROCESSED' as const, processingErrorCode: { not: null } },
          ...(batch.form.formType === 'BENEFICIARY_REGISTRATION' || batch.parentBatchId
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
      resolvedAt: true,
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
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
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
  known?: BatchRowCounts,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  const counts = known ?? (await readBatchRowCounts(tx, batch.id))
  return {
    ...mapBatch(
      batch,
      countRows(counts, (row) => row.warned),
      actor.userId,
      await readWaitingRows(tx, batch),
    ),
    ...registrationCounts(batch, counts),
  }
}

/** Processed rows by outcome, for registration batches and survey parts only; LINKED counts as updated. */
function registrationCounts(batch: BatchRow, counts: BatchRowCounts) {
  if (batch.form.formType !== 'BENEFICIARY_REGISTRATION' && !batch.parentBatchId) return {}
  const count = (...outcomes: string[]) =>
    countRows(counts, (row) => row.outcome !== null && outcomes.includes(row.outcome))
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
