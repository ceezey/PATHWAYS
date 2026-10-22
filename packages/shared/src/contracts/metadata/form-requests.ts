import { z } from 'zod'

import { supportedFormFieldTypes } from '../../validation/form-data'
import {
  isoDateString,
  lengthString,
  queryInteger,
  trimmedInput,
  trimmedLowercaseInput,
  uuidString,
} from '../common/field-schemas'
import { fieldIntakeProperties, formFieldCode } from './form-intake'

// Form types a digital form may declare.
export const digitalFormTypes = [
  'BENEFICIARY_REGISTRATION',
  'TRAINING_SURVEY',
  'PRE_TEST',
  'POST_TEST',
  'OUTCOME_MONITORING',
  'ACTIVITY_MONITORING',
  'OTHER',
] as const
export type DigitalFormType = (typeof digitalFormTypes)[number]

const decimalBound = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/
const calendarDay = /^\d{4}-\d{2}-\d{2}$/

// Object.prototype method names that class-transformer skipped when it copied a values object.
const skippedValueKeys = new Set([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
])

// True when an object at any depth has an own constructor key, which crashed class-transformer.
const hasConstructorKey = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.some(hasConstructorKey)
    : value !== null &&
      typeof value === 'object' &&
      (Object.hasOwn(value, 'constructor') || Object.values(value).some(hasConstructorKey))

// IsObject() response values: method-named keys are dropped as before, and a constructor key is refused.
export const formResponseValues = z.preprocess(
  (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([key]) => !skippedValueKeys.has(key)))
      : value,
  z
    .record(z.unknown())
    .refine((values) => !hasConstructorKey(values), 'must not contain a constructor key'),
)

// One field of a form definition.
export const formFieldRequest = z
  .object({
    code: formFieldCode,
    label: trimmedInput(lengthString(1, 160)),
    dataType: z.enum(supportedFormFieldTypes),
    required: z.boolean(),
    metadataKey: z.boolean(),
    sadddField: z.boolean(),
    allowedValues: z.array(lengthString(0, 120)).min(1).max(100).nullish(),
    minimumValue: z.string().regex(decimalBound, 'must be a decimal number').nullish(),
    maximumValue: z.string().regex(decimalBound, 'must be a decimal number').nullish(),
    minimumDate: z.string().regex(calendarDay, 'must be a YYYY-MM-DD date').nullish(),
    maximumDate: z.string().regex(calendarDay, 'must be a YYYY-MM-DD date').nullish(),
    minimumLength: z.number().int().min(0).max(10_000).nullish(),
    maximumLength: z.number().int().min(1).max(10_000).nullish(),
    ...fieldIntakeProperties,
  })
  .strict()
export type FormFieldRequest = z.infer<typeof formFieldRequest>

const formCode = trimmedLowercaseInput(
  z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, 'must be a lowercase form code'),
)
const formName = trimmedInput(lengthString(3, 160))
const formDefinitionFields = {
  code: formCode,
  name: formName,
  description: lengthString(0, 2_000).nullish(),
  formType: z.enum(digitalFormTypes),
  activityId: uuidString.nullish(),
  journeyStageId: uuidString.nullish(),
  fields: z.array(formFieldRequest).min(1).max(100),
}

// Body of POST metadata/projects/:projectId/forms.
export const createFormRequest = z.object(formDefinitionFields).strict()
export type CreateFormRequest = z.infer<typeof createFormRequest>

// Body of PATCH metadata/projects/:projectId/forms/:formId.
export const updateFormRequest = z
  .object({ ...formDefinitionFields, expectedUpdatedAt: isoDateString })
  .strict()
export type UpdateFormRequest = z.infer<typeof updateFormRequest>

// Body of POST metadata/projects/:projectId/forms/generate.
export const generateFormRequest = z
  .object({
    templateKey: lengthString(0, 64).nullish(),
    sourceFormId: uuidString.nullish(),
    code: formCode,
    name: formName,
  })
  .strict()
export type GenerateFormRequest = z.infer<typeof generateFormRequest>

// Body of the form publish and archive routes.
export const formVersionRequest = z.object({ expectedUpdatedAt: isoDateString }).strict()
export type FormVersionRequest = z.infer<typeof formVersionRequest>

// Body of POST metadata/projects/:projectId/forms/:formId/validate.
export const validateFormValuesRequest = z.object({ values: formResponseValues }).strict()
export type ValidateFormValuesRequest = z.infer<typeof validateFormValuesRequest>

// Body of POST metadata/projects/:projectId/forms/:formId/submissions.
export const saveSubmissionRequest = z
  .object({
    beneficiaryId: uuidString.optional(),
    clientSubmissionId: uuidString,
    values: formResponseValues,
  })
  .strict()
export type SaveSubmissionRequest = z.infer<typeof saveSubmissionRequest>

// Body of PATCH metadata/projects/:projectId/forms/:formId/submissions/:submissionId.
export const updateSubmissionRequest = z
  .object({ expectedUpdatedAt: isoDateString, values: formResponseValues })
  .strict()
export type UpdateSubmissionRequest = z.infer<typeof updateSubmissionRequest>

// Body of POST metadata/projects/:projectId/forms/:formId/submissions/:submissionId/submit.
export const submitSubmissionRequest = z.object({ expectedUpdatedAt: isoDateString }).strict()
export type SubmitSubmissionRequest = z.infer<typeof submitSubmissionRequest>

// Query of GET metadata/projects/:projectId/forms/:formId/submissions.
export const listSubmissionsQuery = z
  .object({
    offset: queryInteger(0, 10_000).default(0),
    limit: queryInteger(1, 50).default(10),
  })
  .strict()
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuery>

// Body of POST metadata/projects/:projectId/forms/:formId/drafts/from-import.
export const draftFromImportRequest = z
  .object({ batchId: uuidString, expectedMappingRevision: z.number().int().min(0).max(1_000) })
  .strict()
export type DraftFromImportRequest = z.infer<typeof draftFromImportRequest>
