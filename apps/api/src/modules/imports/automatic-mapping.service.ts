import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  AUTO_SMART_V2,
  AUTO_SMART_V2_LIMITS,
  type SmartMatchDecision,
  smartMatchColumns,
} from '@pathways/imports/server'
import type { AutomaticImportMappingRequest } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { jsonStringArray } from '../metadata/metadata.mapper'
import { parseAutomaticMappingReceipt } from './automatic-mapping-receipt'
import { lockBatch, requireBatch } from './import-batches.service'
import { safeRawData, safeSourceColumns } from './imports.helpers'
import type { BatchRow } from './imports.mapper'

export async function recordAutomaticMapping(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  input: AutomaticImportMappingRequest,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  if (batch.uploadedById !== actor.userId)
    throw new ForbiddenException('Automatic mapping is unavailable.')
  // Lock before reading the matcher inputs so the recorder re-checks the same batch state.
  await lockBatch(tx, actor, batch.projectId, batch.id)
  const decisions = await smartMappingDecisions(tx, actor, batch)
  let receipt: unknown
  try {
    const rows = await tx.$queryRaw<Array<{ receipt: unknown }>>(Prisma.sql`
          SELECT pathways.p38_record_smart_mapping(
            ${batch.id}::uuid,
            ${input.expectedMappingRevision}::integer,
            ${AUTO_SMART_V2}::text,
            ${JSON.stringify(decisions)}::jsonb
          ) AS receipt
        `)
    if (rows.length !== 1)
      throw new ServiceUnavailableException('Automatic mapping is unavailable.')
    receipt = rows[0].receipt
  } catch (error) {
    const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : null
    const code = meta && typeof meta === 'object' && 'code' in meta ? meta.code : null
    if (code === '22023') throw new BadRequestException('Invalid automatic mapping request.')
    if (code === '40001') throw new ConflictException('The import changed. Reload before retrying.')
    if (code === '42501') throw new ForbiddenException('Automatic mapping is unavailable.')
    throw new ServiceUnavailableException('Automatic mapping is unavailable.')
  }
  try {
    return parseAutomaticMappingReceipt(receipt, batch.id)
  } catch {
    throw new ServiceUnavailableException('Automatic mapping is unavailable.')
  }
}

/**
 * AUTO_SMART_V2 inputs, all scoped to the locked batch: stored headers, the pinned form's
 * fields and a bounded prefix of staged raw values. Sampled values stay in this function;
 * only the matcher's fixed-shape decisions leave it.
 */
async function smartMappingDecisions(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: BatchRow,
): Promise<SmartMatchDecision[]> {
  if (
    batch.storageStatus !== 'STORED' ||
    !['UPLOADED', 'MAPPED'].includes(batch.status) ||
    batch.mappingRevision > 1 ||
    batch.totalRows < 1
  ) {
    throw new ConflictException('The import changed. Reload before retrying.')
  }
  const stored = await tx.dataImportBatch.findFirst({
    where: { id: batch.id, organizationId: actor.organizationId, projectId: batch.projectId },
    select: { sourceHeaders: true },
  })
  if (!stored) throw new NotFoundException('Import batch unavailable.')
  const sourceColumns = safeSourceColumns(stored.sourceHeaders)
  const fields = await tx.formField.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
    },
    select: {
      id: true,
      code: true,
      label: true,
      dataType: true,
      allowedValues: true,
      minimumLength: true,
      maximumLength: true,
    },
    orderBy: { sequenceNo: 'asc' },
    take: AUTO_SMART_V2_LIMITS.maxFields + 1,
  })
  if (
    sourceColumns.length < 1 ||
    fields.length < 1 ||
    fields.length > AUTO_SMART_V2_LIMITS.maxFields
  ) {
    throw new BadRequestException('Invalid automatic mapping request.')
  }
  const rows = await tx.dataImportRow.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      importBatchId: batch.id,
    },
    select: { rawData: true },
    orderBy: { rowNumber: 'asc' },
    take: AUTO_SMART_V2_LIMITS.sampleRows,
  })
  const raw = rows.map((row) => safeRawData(row.rawData))
  try {
    return smartMatchColumns(
      sourceColumns.map((column) => ({
        key: column.key,
        columnIndex: column.columnIndex,
        header: column.header,
        samples: raw.map((values) => values[column.key]),
      })),
      fields.map((field) => ({
        id: field.id,
        code: field.code,
        label: field.label,
        dataType: field.dataType,
        allowedValues: jsonStringArray(field.allowedValues),
        minimumLength: field.minimumLength,
        maximumLength: field.maximumLength,
      })),
    )
  } catch {
    throw new BadRequestException('Invalid automatic mapping request.')
  }
}
