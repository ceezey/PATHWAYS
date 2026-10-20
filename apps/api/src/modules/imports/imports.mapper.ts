import type { ImportBatchResponse } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

export const batchSelection = {
  id: true,
  projectId: true,
  formId: true,
  formVersion: true,
  originalFileName: true,
  fileType: true,
  sourceChecksum: true,
  clientImportId: true,
  storageStatus: true,
  status: true,
  mappingRevision: true,
  validationRevision: true,
  validatedMappingRevision: true,
  processingRevision: true,
  totalRows: true,
  validRows: true,
  invalidRows: true,
  processedRows: true,
  unprocessedRows: true,
  failedRows: true,
  failureCode: true,
  uploadedById: true,
  reviewedById: true,
  uploadedAt: true,
  validatedAt: true,
  processedAt: true,
  updatedAt: true,
  form: {
    select: { code: true, name: true, formType: true, status: true },
  },
} satisfies Prisma.DataImportBatchSelect

export type BatchRow = Prisma.DataImportBatchGetPayload<{ select: typeof batchSelection }>

export const fieldSelection = {
  id: true,
  code: true,
  label: true,
  dataType: true,
  isRequired: true,
  allowedValues: true,
  minimumValue: true,
  maximumValue: true,
  minimumDate: true,
  maximumDate: true,
  minimumLength: true,
  maximumLength: true,
  isMetadataKey: true,
} satisfies Prisma.FormFieldSelect

export type FieldRow = Prisma.FormFieldGetPayload<{ select: typeof fieldSelection }>

export function mapBatch(batch: BatchRow): ImportBatchResponse {
  return {
    id: batch.id,
    projectId: batch.projectId,
    formId: batch.formId,
    formVersion: batch.formVersion,
    formCode: batch.form.code,
    formName: batch.form.name,
    formType: batch.form.formType,
    originalFileName: batch.originalFileName,
    fileType: batch.fileType,
    clientImportId: batch.clientImportId,
    storageStatus: batch.storageStatus,
    status: batch.status,
    mappingRevision: batch.mappingRevision,
    validationRevision: batch.validationRevision,
    validatedMappingRevision: batch.validatedMappingRevision,
    processingRevision: batch.processingRevision,
    totals: {
      rows: batch.totalRows,
      valid: batch.validRows,
      invalid: batch.invalidRows,
      processed: batch.processedRows,
      unprocessed: batch.unprocessedRows,
      failed: batch.failedRows,
    },
    failureCode: batch.failureCode,
    uploadedAt: batch.uploadedAt.toISOString(),
    validatedAt: batch.validatedAt?.toISOString(),
    processedAt: batch.processedAt?.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  }
}
