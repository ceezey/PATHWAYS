import { z } from 'zod'

import { formDefinitionLimits, supportedFormFieldTypes } from '../../validation/form-data'
import { hasUniqueItems, lengthString, trimmedInput, uuidString } from '../common/field-schemas'
import { fieldIntakeRule } from '../metadata/form-intake'

// Codes that leave an imported row UNPROCESSED for a person: the registration service's review codes plus the file-import ones.
export const importHoldCodes = [
  'CONSENT_REQUIRED',
  'GUARDIAN_CONSENT_REQUIRED',
  'AMBIGUOUS_IDENTITY',
  'IDENTITY_REVIEW_REQUIRED',
  'DUPLICATE_IDENTITY',
  'UNKNOWN_IDENTITY',
  'IDENTIFIER_CODE_CONFLICT',
  'SUBJECT_TYPE_CONFLICT',
  'SHARED_PROFILE_UPDATE_REVIEW_REQUIRED',
  'PROFILE_CHANGED',
  'IDENTITY_CONFLICT',
  'IDENTITY_MISSING',
] as const
export const importHoldCode = z.enum(importHoldCodes)
export type ImportHoldCode = z.infer<typeof importHoldCode>

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
const json: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
  ]),
)

// A typed answer is text, a number, a yes or no, nothing, or a list of choices, within the form limits.
const ownValue = z.union([
  z.string().max(formDefinitionLimits.longTextLength),
  z.number(),
  z.boolean(),
  z.null(),
  z
    .array(z.string().max(formDefinitionLimits.textLength))
    .max(formDefinitionLimits.multiSelectValues),
])

const fieldCode = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'must be a lowercase field code')

const maxReviewFields = 100
// Rows one import request promotes in a single verified transaction.
export const importCheckpointRows = 25

// One field of a held row with the value PATHWAYS holds, the value in the file and the calculated one.
export const importRowReviewFieldResponse = z.object({
  code: z.string(),
  label: z.string(),
  dataType: z.enum(supportedFormFieldTypes),
  options: z.array(z.string()).nullable(),
  pathways: json.nullable(),
  file: json.nullable(),
  // The file's text when validation left the field without a usable value, shown to the reviewer and never a value to pick.
  fileUnusable: z.string().nullable(),
  calculated: json.nullable(),
  // The field's calculation or check, so the window can say how the calculated value was worked out.
  rule: fieldIntakeRule.nullable(),
  changed: z.boolean(),
})
export type ImportRowReviewFieldResponse = z.infer<typeof importRowReviewFieldResponse>

// Body of GET imports/projects/:projectId/batches/:batchId/rows/:rowId/review, used as a type and never parsed at runtime.
export const importRowReviewResponse = z.object({
  rowId: z.string(),
  rowNumber: z.number().int(),
  reason: z.string(),
  participant: z
    .object({ beneficiaryId: z.string(), clientId: z.string(), displayName: z.string() })
    .nullable(),
  fields: z.array(importRowReviewFieldResponse),
  canAddNew: z.boolean(),
})
export type ImportRowReviewResponse = z.infer<typeof importRowReviewResponse>

export const importResolveChoices = ['PATHWAYS', 'FILE', 'CALCULATED', 'OWN'] as const

// Body of POST imports/projects/:projectId/batches/:batchId/rows/:rowId/resolve.
export const resolveImportRowRequest = z
  .object({
    expectedValidationRevision: z.number().int().min(1),
    saveAs: z.enum(['UPDATE', 'NEW']),
    choices: z.record(fieldCode, z.enum(importResolveChoices)),
    own: z.record(fieldCode, ownValue),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (Object.keys(body.choices).length > maxReviewFields) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'too many fields' })
    }
    for (const code of Object.keys(body.own)) {
      if (body.choices[code] !== 'OWN') {
        ctx.addIssue({ code: 'custom', path: ['own', code], message: 'needs the OWN choice' })
      }
    }
  })
export type ResolveImportRowRequest = z.infer<typeof resolveImportRowRequest>

// Body the resolve route returns: saved, or saved and waiting for a Project Officer to approve guardian consent.
export type ResolveImportRowResponse = { status: 'PROCESSED' | 'WAITING_FOR_PROJECT_OFFICER' }

// A YYYY-MM-DD text that names a real day.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, 'not a real date')

// Body of POST imports/projects/:projectId/batches/:batchId/guardian-approvals.
export const approveGuardianConsentRequest = z
  .object({
    rowIds: z
      .array(uuidString)
      .min(1)
      .max(importCheckpointRows)
      .refine(hasUniqueItems, 'must be unique'),
    guardianName: trimmedInput(lengthString(1, 160)).optional(),
    consentDate: calendarDate.optional(),
    note: trimmedInput(lengthString(1, 500)).optional(),
  })
  .strict()
  // One parent's name and date must not land on other children's records.
  .superRefine((body, ctx) => {
    if (body.rowIds.length > 1) {
      for (const key of ['guardianName', 'consentDate', 'note'] as const) {
        if (body[key] !== undefined) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'only for a single participant' })
        }
      }
    }
  })
export type ApproveGuardianConsentRequest = z.infer<typeof approveGuardianConsentRequest>
