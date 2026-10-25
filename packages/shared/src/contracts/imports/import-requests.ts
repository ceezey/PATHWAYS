import { z } from 'zod'

import { supportedFormFieldTypes } from '../../validation/form-data'
import {
  lengthString,
  queryInteger,
  trimmedInput,
  trimmedLowercaseInput,
  uuidString,
} from '../common/field-schemas'

// Bounds shared with @pathways/imports, whose limits test pins them to its engineering limits.
export const importRequestLimits = {
  maxSourceColumns: 500,
  maxValueMapEntries: 50,
  maxValueMapTextLength: 100,
} as const

// Where the year, month and day sit in a text date column, chosen when more than one order reads it.
export const importDateOrders = ['YMD', 'DMY', 'MDY'] as const
export type ImportDateOrder = (typeof importDateOrders)[number]

// No control characters, and no leading formula trigger (= + @ or a minus that is not a number).
const safeMapText = /^(?![=+@\t\r]|-(?!\d))\P{Cc}*$/u

// One side of a value map entry, trimmed first.
export const valueMapText = (min: number) =>
  trimmedInput(
    lengthString(min, importRequestLimits.maxValueMapTextLength).refine(
      (value) => safeMapText.test(value),
      'Control characters and formula prefixes are not allowed.',
    ),
  )

// Multipart fields of POST imports/projects/:projectId/batches/upload.
export const uploadImportRequest = z
  .object({
    formId: uuidString,
    clientImportId: uuidString,
    // The worksheet to read when a workbook has several; without it such a workbook is refused.
    // Kept exactly as written, since the parser matches the worksheet name character for character.
    sheetName: lengthString(1, 100)
      .refine((value) => /\S/.test(value) && !/\p{Cc}/u.test(value), 'must be a visible sheet name')
      .optional(),
  })
  .strict()
export type UploadImportRequest = z.infer<typeof uploadImportRequest>

// One source column decision inside a saved import mapping.
export const importMappingItemRequest = z
  .object({
    sourceFieldName: trimmedInput(lengthString(1, 100)),
    targetFieldCode: trimmedLowercaseInput(
      z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'must be a lowercase field code'),
    ).nullish(),
    ignored: z.boolean(),
    dataType: z.enum(supportedFormFieldTypes).nullish(),
    valueMap: z
      .array(z.object({ from: valueMapText(1), to: valueMapText(0) }).strict())
      .min(1)
      .max(importRequestLimits.maxValueMapEntries)
      .nullish(),
    dateOrder: z.enum(importDateOrders).nullish(),
  })
  .strict()
export type ImportMappingItemRequest = z.infer<typeof importMappingItemRequest>

// Body of PATCH imports/projects/:projectId/batches/:batchId/mapping.
export const saveImportMappingRequest = z
  .object({
    expectedMappingRevision: z.number().int().min(0),
    mappings: z.array(importMappingItemRequest).min(1).max(importRequestLimits.maxSourceColumns),
  })
  .strict()
export type SaveImportMappingRequest = z.infer<typeof saveImportMappingRequest>

// Body of POST imports/projects/:projectId/batches/:batchId/automatic-mapping.
export const automaticImportMappingRequest = z
  .object({ expectedMappingRevision: z.union([z.literal(0), z.literal(1)]) })
  .strict()
export type AutomaticImportMappingRequest = z.infer<typeof automaticImportMappingRequest>

// Body of POST imports/projects/:projectId/batches/:batchId/rerun.
export const rerunImportRequest = z.object({ formId: uuidString }).strict()
export type RerunImportRequest = z.infer<typeof rerunImportRequest>

// Body of POST imports/projects/:projectId/batches/:batchId/validate.
export const validateImportRequest = z
  .object({ expectedMappingRevision: z.number().int().min(1) })
  .strict()
export type ValidateImportRequest = z.infer<typeof validateImportRequest>

// Body of POST imports/projects/:projectId/batches/:batchId/process.
export const processImportRequest = z
  .object({ expectedValidationRevision: z.number().int().min(1) })
  .strict()
export type ProcessImportRequest = z.infer<typeof processImportRequest>

// Query of GET imports/projects/:projectId/batches/:batchId/rows.
export const importRowsQuery = z
  .object({
    offset: queryInteger(0, 50_000).default(0),
    take: queryInteger(1, 100).default(50),
  })
  .strict()
export type ImportRowsQuery = z.infer<typeof importRowsQuery>
