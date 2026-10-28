import { BadRequestException, ConflictException } from '@nestjs/common'
import {
  IMPORT_ENGINEERING_LIMITS,
  type IntakeField,
  isSupplied,
  unsuppliedRequired,
  validateRows,
} from '@pathways/imports/server'
import type { FieldIntakeRule, ValidateImportRequest } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { formFieldContract } from '../../common/forms/form-field-contract'
import type { Tx } from '../../common/prisma/transaction'
import { currentBusinessDate } from '../../common/time/business-date'
import { lockBatch, mapStoredBatch, requireBatchWithHeaders } from './import-batches.service'
import { safeRawData, safeSourceColumns } from './imports.helpers'
import { type FieldRow, fieldSelection } from './imports.mapper'

export { columnRules, valuesByFieldCode } from '@pathways/imports/server'

export function intakeField(row: FieldRow): IntakeField {
  return {
    ...formFieldContract(row),
    sadddField: row.isSadddField,
    sourceNames: row.sourceNames,
    valueAliases: row.valueAliases as IntakeField['valueAliases'],
    importDefault: row.importDefault,
    rule: row.rule as FieldIntakeRule | null,
  }
}

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
      dateOrder: true,
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
  const formFields = await tx.formField.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
    },
    select: fieldSelection,
    orderBy: { sequenceNo: 'asc' },
    take: IMPORT_ENGINEERING_LIMITS.maxMappedFields,
  })
  const mappedCodes = new Set(mappedFields.map((field) => field.code))
  const formIntake = formFields.map(intakeField)
  const unsupplied = unsuppliedRequired(formIntake, mappedCodes)
  if (unsupplied.length) {
    throw new BadRequestException(
      `Every required form field must have a source mapping. No source for: ${unsupplied.map((field) => field.code).join(', ')}.`,
    )
  }
  const fields = [
    ...mappedFields.map(intakeField),
    ...formIntake.filter((field) => !mappedCodes.has(field.code) && isSupplied(field, mappedCodes)),
  ]
  const rows = await tx.dataImportRow.findMany({
    where: { organizationId: actor.organizationId, importBatchId: batch.id },
    select: { id: true, rowNumber: true, rawData: true },
    orderBy: { rowNumber: 'asc' },
    take: IMPORT_ENGINEERING_LIMITS.maxRows,
  })
  const validationRevision = batch.validationRevision + 1
  const uploadDate = currentBusinessDate(batch.createdAt)
  const raws = rows.map((row) => safeRawData(row.rawData))
  const results = validateRows({
    formType: batch.form.formType,
    fields,
    mappedFields: mappedFields.map((field) => ({
      ...intakeField(field),
      metadataKey: field.isMetadataKey,
    })),
    mappings,
    raws,
    uploadDate,
  })
  let valid = 0
  let invalid = 0
  let warned = 0
  const validatedAt = new Date()
  const rowUpdates = results.map((result, index) => {
    if (result.valid) valid += 1
    else invalid += 1
    if (result.warnings.length > 0) warned += 1
    return {
      id: rows[index].id,
      status: result.valid ? 'VALID' : 'INVALID',
      normalized_data: result.valid ? result.values : null,
      validation_errors: result.errors,
      validation_warnings: result.warnings,
    }
  })
  const updatedRows = await tx.$executeRaw(Prisma.sql`
        UPDATE pathways.data_import_rows AS r
        SET status=v.status::pathways.import_row_status,
          normalized_data=v.normalized_data,
          validation_errors=v.validation_errors,
          validation_warnings=v.validation_warnings,
          mapping_revision=${batch.mappingRevision},
          validation_revision=${validationRevision},
          validated_by_id=${actor.userId}::uuid,
          validated_at=${validatedAt},
          processed_at=NULL,
          processing_claim_id=NULL,
          processing_claimed_at=NULL,
          processing_error_code=NULL
        FROM jsonb_to_recordset(${JSON.stringify(rowUpdates)}::jsonb)
          AS v(id uuid,status text,normalized_data jsonb,validation_errors jsonb,
            validation_warnings jsonb)
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
      warnings: warned,
      formVersionId: batch.formId,
      formPublishedById: batch.form.publishedById,
    },
  })
  return mapStoredBatch(tx, actor, batch.projectId, batch.id)
}
