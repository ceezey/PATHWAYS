import { z } from 'zod'

import { supportedFormFieldTypes } from '../../validation/form-data'
import { digitalFormTypes } from '../metadata/form-requests'

// Response shapes of the import routes, used as types and never parsed at runtime.

const fieldReference = z.object({ code: z.string(), label: z.string() })

// One source column of a stored import; the key is the stable name mappings refer to.
export const importSourceColumnResponse = z.object({
  key: z.string(),
  header: z.string(),
  columnIndex: z.number().int(),
})
export type ImportSourceColumnResponse = z.infer<typeof importSourceColumnResponse>

// One import batch as the list, upload, mapping, validate and process routes return it.
export const importBatchResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  formId: z.string(),
  formVersion: z.number().int(),
  formCode: z.string(),
  formName: z.string(),
  formType: z.enum(digitalFormTypes),
  originalFileName: z.string(),
  fileType: z.enum(['CSV', 'XLSX', 'XLS', 'JSON', 'OTHER', 'PDF']),
  clientImportId: z.string(),
  storageStatus: z.enum(['RESERVED', 'STORED', 'RECOVERY_REQUIRED', 'FAILED']),
  status: z.enum([
    'UPLOADING',
    'UPLOADED',
    'MAPPED',
    'VALIDATED',
    'PROCESSING',
    'PARTIALLY_PROCESSED',
    'PROCESSED',
    'RECOVERY_REQUIRED',
    'FAILED',
  ]),
  mappingRevision: z.number().int(),
  validationRevision: z.number().int(),
  validatedMappingRevision: z.number().int().nullable(),
  processingRevision: z.number().int(),
  totals: z.object({
    rows: z.number().int(),
    valid: z.number().int(),
    invalid: z.number().int(),
    processed: z.number().int(),
    unprocessed: z.number().int(),
    failed: z.number().int(),
    // Rows with at least one validation warning.
    warnings: z.number().int(),
  }),
  failureCode: z.string().nullable(),
  // True when the caller uploaded the batch, the only person who may re-run it.
  uploadedByCurrentUser: z.boolean(),
  uploadedAt: z.string(),
  validatedAt: z.string().optional(),
  processedAt: z.string().optional(),
  updatedAt: z.string(),
})
export type ImportBatchResponse = z.infer<typeof importBatchResponse>

// One stored mapping decision of the current mapping revision.
export const importMappingResponse = z.object({
  sourceFieldName: z.string(),
  status: z.enum(['PENDING', 'MAPPED', 'INVALID', 'IGNORED']),
  revision: z.number().int(),
  targetField: fieldReference.nullable(),
  validationMessage: z.string().nullable(),
  suggestedField: fieldReference.nullable(),
  matchScore: z.number().int().nullable(),
  matchReason: z.string().nullable(),
  dataType: z.enum(supportedFormFieldTypes).nullable(),
  valueMap: z.array(z.object({ from: z.string(), to: z.string() })).nullable(),
})
export type ImportMappingResponse = z.infer<typeof importMappingResponse>

// GET imports/projects/:projectId/batches/:batchId adds the source columns and the stored mappings.
export const importBatchDetailResponse = importBatchResponse.extend({
  sourceHeaders: z.array(z.string()),
  sourceColumns: z.array(importSourceColumnResponse),
  mappings: z.array(importMappingResponse),
})
export type ImportBatchDetailResponse = z.infer<typeof importBatchDetailResponse>

// One staged row; the raw values, validation errors and warnings (codes only) are stored as JSON.
export const importRowResponse = z.object({
  id: z.string(),
  rowNumber: z.number().int(),
  rawData: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  status: z.enum([
    'PENDING',
    'VALID',
    'INVALID',
    'PROCESSING',
    'UNPROCESSED',
    'PROCESSED',
    'FAILED',
  ]),
  validationErrors: z.array(
    z.object({ fieldCode: z.string(), code: z.string(), message: z.string() }),
  ),
  validationWarnings: z.array(z.object({ fieldCode: z.string(), code: z.string() })),
  mappingRevision: z.number().int(),
  validationRevision: z.number().int(),
  processingAttempts: z.number().int(),
  processingErrorCode: z.string().nullable(),
  updatedAt: z.string(),
})
export type ImportRowResponse = z.infer<typeof importRowResponse>

// Body of GET imports/projects/:projectId/batches/:batchId/rows.
export const importRowsPageResponse = z.object({
  offset: z.number().int(),
  take: z.number().int(),
  total: z.number().int(),
  rows: z.array(importRowResponse),
})
export type ImportRowsPageResponse = z.infer<typeof importRowsPageResponse>
