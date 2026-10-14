import { BadRequestException, ConflictException } from '@nestjs/common'
import {
  IMPORT_ENGINEERING_LIMITS,
  type ImportColumnRule,
  buildImportValueMap,
  normalizeImportedRow,
} from '@pathways/imports/server'
import type { ValidateImportRequest } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { formFieldContract } from '../metadata/metadata.mapper'
import { lockBatch, mapStoredBatch, requireBatchWithHeaders } from './import-batches.service'
import { safeRawData, safeSourceColumns, stableJson, storedValueMap } from './imports.helpers'
import { fieldSelection } from './imports.mapper'

export async function validateBatchRows(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  input: ValidateImportRequest,
) {
  await lockBatch(tx, actor, projectId, batchId)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (batch.mappingRevision !== input.expectedMappingRevision || batch.mappingRevision < 1) {
    throw new ConflictException('The mapping revision is stale or incomplete.')
  }
  if (batch.processingRevision > 0) {
    throw new ConflictException('A processed import cannot be revalidated.')
  }
  const mappings = await tx.metadataMapping.findMany({
    where: { importBatchId: batch.id, revision: batch.mappingRevision },
    select: {
      sourceFieldName: true,
      status: true,
      dataType: true,
      valueMap: true,
      targetField: { select: fieldSelection },
    },
    take: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
  })
  const sourceKeys = new Set(safeSourceColumns(batch.sourceHeaders).map((column) => column.key))
  const mappedSourceKeys = new Set(mappings.map((mapping) => mapping.sourceFieldName))
  const mappedTargets = mappings.flatMap((mapping) =>
    mapping.status === 'MAPPED' && mapping.targetField ? [mapping.targetField.code] : [],
  )
  if (
    mappings.length !== sourceKeys.size ||
    mappedSourceKeys.size !== sourceKeys.size ||
    mappings.some(
      (mapping) =>
        !sourceKeys.has(mapping.sourceFieldName) ||
        (mapping.status !== 'MAPPED' && mapping.status !== 'IGNORED') ||
        (mapping.status === 'MAPPED' && !mapping.targetField) ||
        (mapping.status === 'IGNORED' && mapping.targetField !== null),
    ) ||
    new Set(mappedTargets).size !== mappedTargets.length
  ) {
    throw new ConflictException('The reviewed mapping is incomplete.')
  }
  const mappedFields = mappings.flatMap((mapping) =>
    mapping.status === 'MAPPED' && mapping.targetField ? [mapping.targetField] : [],
  )
  const fields = mappedFields.map(formFieldContract)
  const requiredCodes = await tx.formField.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      isRequired: true,
    },
    select: { code: true },
  })
  const mappedCodes = new Set(fields.map((field) => field.code))
  if (requiredCodes.some((field) => !mappedCodes.has(field.code))) {
    throw new BadRequestException('Every required form field must have a source mapping.')
  }
  const rules = Object.create(null) as Record<string, ImportColumnRule>
  for (const mapping of mappings) {
    if (mapping.status !== 'MAPPED' || !mapping.targetField) continue
    rules[mapping.targetField.code] = {
      ...(mapping.dataType ? { dataType: mapping.dataType } : {}),
      ...(mapping.valueMap
        ? { valueMap: buildImportValueMap(storedValueMap(mapping.valueMap)) }
        : {}),
    }
  }
  const rows = await tx.dataImportRow.findMany({
    where: { organizationId: actor.organizationId, importBatchId: batch.id },
    select: { id: true, rowNumber: true, rawData: true },
    orderBy: { rowNumber: 'asc' },
    take: IMPORT_ENGINEERING_LIMITS.maxRows,
  })
  const validationRevision = batch.validationRevision + 1
  const results = rows.map((row) => {
    const raw = safeRawData(row.rawData)
    const byFieldCode = Object.create(null) as Record<string, unknown>
    for (const mapping of mappings) {
      if (mapping.status === 'MAPPED' && mapping.targetField) {
        byFieldCode[mapping.targetField.code] = raw[mapping.sourceFieldName]
      }
    }
    return { row, result: normalizeImportedRow(fields, byFieldCode, rules) }
  })
  const metadataKeys = mappedFields
    .filter((field) => field.isMetadataKey)
    .map((field) => field.code)
  if (metadataKeys.length > 0) {
    const seen = new Map<string, number[]>()
    results.forEach(({ result }, index) => {
      if (!result.valid) return
      const key = stableJson(metadataKeys.map((code) => result.values[code]))
      const entries = seen.get(key) ?? []
      entries.push(index)
      seen.set(key, entries)
    })
    for (const duplicates of seen.values()) {
      if (duplicates.length < 2) continue
      for (const index of duplicates) {
        results[index].result.valid = false
        results[index].result.errors.push({
          fieldCode: metadataKeys.join(','),
          code: 'DUPLICATE_BUSINESS_KEY',
          message: 'The metadata key is duplicated within this import.',
        })
      }
    }
  }
  let valid = 0
  let invalid = 0
  const validatedAt = new Date()
  const rowUpdates = results.map(({ row, result }) => {
    if (result.valid) valid += 1
    else invalid += 1
    return {
      id: row.id,
      status: result.valid ? 'VALID' : 'INVALID',
      normalized_data: result.valid ? result.values : null,
      validation_errors: result.errors,
    }
  })
  const updatedRows = await tx.$executeRaw(Prisma.sql`
        UPDATE pathways.data_import_rows AS r
        SET status=v.status::pathways.import_row_status,
          normalized_data=v.normalized_data,
          validation_errors=v.validation_errors,
          mapping_revision=${batch.mappingRevision},
          validation_revision=${validationRevision},
          validated_by_id=${actor.userId}::uuid,
          validated_at=${validatedAt},
          processed_at=NULL,
          processing_claim_id=NULL,
          processing_claimed_at=NULL,
          processing_error_code=NULL
        FROM jsonb_to_recordset(${JSON.stringify(rowUpdates)}::jsonb)
          AS v(id uuid,status text,normalized_data jsonb,validation_errors jsonb)
        WHERE r.id=v.id AND r.organization_id=${actor.organizationId}::uuid
          AND r.import_batch_id=${batch.id}::uuid
          AND r.status IN ('PENDING','VALID','INVALID')
      `)
  if (updatedRows !== rows.length) {
    throw new ConflictException('Import rows changed while validation was running.')
  }
  await tx.dataImportBatch.update({
    where: { id: batch.id },
    data: {
      status: 'VALIDATED',
      validationRevision,
      validatedMappingRevision: batch.mappingRevision,
      reviewedById: actor.userId,
      validRows: valid,
      invalidRows: invalid,
      processedRows: 0,
      unprocessedRows: 0,
      failedRows: 0,
      validatedAt,
      processedAt: null,
      failureCode: null,
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_VALIDATED',
    entityType: 'DataImportBatch',
    entityId: batch.id,
    changes: {
      mappingRevision: batch.mappingRevision,
      validationRevision,
      total: rows.length,
      valid,
      invalid,
    },
  })
  return mapStoredBatch(tx, actor, batch.projectId, batch.id)
}
