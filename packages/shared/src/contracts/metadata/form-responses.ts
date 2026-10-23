import { z } from 'zod'

import { supportedFormFieldTypes } from '../../validation/form-data'
import { fieldIntakeProperties } from './form-intake'
import { digitalFormTypes } from './form-requests'

// Response shapes of the form and direct entry routes, used as types and never parsed at runtime.

// One field of a form as every form route returns it; bounds arrive as text, absent bounds are left out.
export const formFieldResponse = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
  dataType: z.enum(supportedFormFieldTypes),
  required: z.boolean(),
  metadataKey: z.boolean(),
  sadddField: z.boolean(),
  allowedValues: z.array(z.string()).nullable(),
  minimumValue: z.string().optional(),
  maximumValue: z.string().optional(),
  minimumDate: z.string().optional(),
  maximumDate: z.string().optional(),
  minimumLength: z.number().int().nullable(),
  maximumLength: z.number().int().nullable(),
  ...fieldIntakeProperties,
  sequence: z.number().int(),
})
export type FormFieldResponse = z.infer<typeof formFieldResponse>

// Why a draft change needs a person's check before publishing; mirrors the import drafter's reasons.
export const draftNeedsCheckReasons = [
  'SUGGESTED_SOURCE_NAME',
  'ENUM_ANSWER_UNRESOLVED',
  'IMPORT_DEFAULT',
  'RULE_PROPOSED',
  'CONSENT_SOURCE_PROPOSED',
  'PARTICIPATION_CONSENT_NO_SOURCE',
  'IDENTIFIER_PROPOSED',
  'WASHINGTON_GROUP_FLAG_DISAGREES',
  'COLUMN_MOVED_OFF_CALCULATED',
] as const

// What a draft from an import changed, as field codes and counts only.
export const draftSummaryResponse = z.object({
  addedFields: z.array(z.string()),
  sourceNamesAdded: z.array(z.string()),
  optionsAdded: z.array(z.string()),
  aliasesAdded: z.number().int(),
  defaults: z.array(z.string()),
  rules: z.array(z.string()),
  needsCheck: z.array(z.object({ fieldCode: z.string(), reason: z.enum(draftNeedsCheckReasons) })),
})
export type DraftSummaryResponse = z.infer<typeof draftSummaryResponse>

// One form version as the list, read, create, update, publish, archive, version and generate routes return it.
export const formResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  code: z.string(),
  version: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  formType: z.enum(digitalFormTypes),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  activityId: z.string().nullable(),
  journeyStageId: z.string().nullable(),
  publishedAt: z.string().optional(),
  archivedAt: z.string().optional(),
  updatedAt: z.string(),
  createdByCurrentUser: z.boolean(),
  // What the import drafter changed, kept on the draft until it is published; null on any other form.
  draftSummary: draftSummaryResponse.nullable(),
  fields: z.array(formFieldResponse),
})
export type FormResponse = z.infer<typeof formResponse>

// One own direct entry submission with its stored values keyed by field code.
export const formSubmissionResponse = z.object({
  id: z.string(),
  clientSubmissionId: z.string(),
  beneficiaryId: z.string().nullable(),
  status: z.enum(['DRAFT', 'VALIDATED', 'PROCESSED', 'REJECTED']),
  formId: z.string(),
  formVersion: z.number().int(),
  submittedAt: z.string().optional(),
  updatedAt: z.string(),
  values: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])),
})
export type FormSubmissionResponse = z.infer<typeof formSubmissionResponse>

// One row of GET metadata/projects/:projectId/forms/:formId/submissions.
export const formSubmissionSummaryResponse = z.object({
  id: z.string(),
  status: z.enum(['DRAFT', 'VALIDATED', 'PROCESSED', 'REJECTED']),
  formVersion: z.number().int(),
  submittedAt: z.string().optional(),
  updatedAt: z.string(),
})
export type FormSubmissionSummaryResponse = z.infer<typeof formSubmissionSummaryResponse>

// Body of GET metadata/projects/:projectId/forms/:formId/submissions.
export const formSubmissionPageResponse = z.object({
  offset: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(formSubmissionSummaryResponse),
})
export type FormSubmissionPageResponse = z.infer<typeof formSubmissionPageResponse>

// Body of POST metadata/projects/:projectId/forms/:formId/drafts/from-import.
export const draftFromImportResponse = z.object({
  form: formResponse,
  summary: draftSummaryResponse,
})
export type DraftFromImportResponse = z.infer<typeof draftFromImportResponse>
