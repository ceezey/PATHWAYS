import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  AUTO_SMART_V2_LIMITS,
  AUTO_SMART_V3,
  type CoverageField,
  IMPORT_ENGINEERING_LIMITS,
  type SmartMatchDecision,
  importCoverage,
  smartMatchColumnsV3,
} from '@pathways/imports/server'
import {
  type AutomaticImportMappingRequest,
  CALCULATED_RULE_KINDS,
  fieldIntakeProperties,
  fieldIntakeRule,
} from '@pathways/shared'
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
  const { decisions, fields, distinctValues } = await smartMappingInputs(tx, actor, batch)
  let receipt: unknown
  try {
    const rows = await tx.$queryRaw<Array<{ receipt: unknown }>>(Prisma.sql`
          SELECT pathways.p78_record_smart_mapping(
            ${batch.id}::uuid,
            ${input.expectedMappingRevision}::integer,
            ${AUTO_SMART_V3}::text,
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
    if (!receipt || typeof receipt !== 'object')
      throw new Error('Invalid automatic mapping receipt.')
    const covered = importCoverage({ decisions, fields, distinctValues })
    return parseAutomaticMappingReceipt(
      {
        ...receipt,
        coverage: covered.coverage,
        uncoveredColumns: covered.uncoveredColumns,
        unresolvedValues: covered.unresolvedValues,
      },
      batch.id,
    )
  } catch {
    throw new ServiceUnavailableException('Automatic mapping is unavailable.')
  }
}

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
const parsed = <T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown,
) => {
  const result = schema.safeParse(value)
  return result.success ? result.data : undefined
}

/**
 * AUTO_SMART_V3 inputs, all scoped to the locked batch: stored headers, the pinned form's
 * fields and the staged raw values. Cell values stay in this function; only the matcher's
 * fixed-shape decisions and the coverage inputs leave it, and the distinct values go no further
 * than the in-process coverage count.
 */
async function smartMappingInputs(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: BatchRow,
): Promise<{
  decisions: SmartMatchDecision[]
  fields: CoverageField[]
  distinctValues: Record<string, unknown[]>
}> {
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
  const storedFields = await tx.formField.findMany({
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
      sourceNames: true,
      valueAliases: true,
      importDefault: true,
      rule: true,
      isRequired: true,
    },
    orderBy: { sequenceNo: 'asc' },
    take: AUTO_SMART_V2_LIMITS.maxFields + 1,
  })
  if (
    sourceColumns.length < 1 ||
    storedFields.length < 1 ||
    storedFields.length > AUTO_SMART_V2_LIMITS.maxFields
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
    take: IMPORT_ENGINEERING_LIMITS.maxRows,
  })
  const raw = rows.map((row) => safeRawData(row.rawData))
  const sampleRows = raw.slice(0, AUTO_SMART_V2_LIMITS.sampleRows)
  const distinct = new Map(sourceColumns.map((column) => [column.key, new Set<unknown>()]))
  const blank = new Set(sourceColumns.map((column) => column.key))
  for (const values of raw) {
    for (const column of sourceColumns) {
      const value = values[column.key]
      if (isBlank(value)) continue
      blank.delete(column.key)
      const seen = distinct.get(column.key)
      seen?.add(value)
    }
  }
  const fields: CoverageField[] = storedFields.map((field) => {
    const rule = parsed(fieldIntakeRule, field.rule) ?? null
    return {
      id: field.id,
      code: field.code,
      label: field.label,
      dataType: field.dataType,
      allowedValues: jsonStringArray(field.allowedValues),
      minimumLength: field.minimumLength,
      maximumLength: field.maximumLength,
      sourceNames: field.sourceNames,
      valueAliases: parsed(fieldIntakeProperties.valueAliases, field.valueAliases) ?? null,
      calculated: rule !== null && (CALCULATED_RULE_KINDS as readonly string[]).includes(rule.kind),
      required: field.isRequired,
      importDefault: field.importDefault,
      rule,
    }
  })
  try {
    const decisions = smartMatchColumnsV3(
      sourceColumns.map((column) => ({
        key: column.key,
        columnIndex: column.columnIndex,
        header: column.header,
        samples: sampleRows.map((values) => values[column.key]),
        blank: blank.has(column.key),
      })),
      fields,
    )
    return {
      decisions,
      fields,
      distinctValues: Object.fromEntries([...distinct].map(([key, values]) => [key, [...values]])),
    }
  } catch {
    throw new BadRequestException('Invalid automatic mapping request.')
  }
}
