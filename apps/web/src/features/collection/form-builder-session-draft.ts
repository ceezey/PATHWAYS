import type { DigitalFormType } from '@/types/pathways'
import type { BuilderFormField } from './digital-form-contract'

export type FormBuilderSessionDraft = {
  schemaVersion: 1
  baseUpdatedAt: string | null
  mode: 'scratch' | 'import' | 'extend'
  view: 'home' | 'forms' | 'builder' | 'import'
  formTitle: string
  formCode: string
  formType: DigitalFormType
  projectId: string
  journeyStage: string
  linkedActivityId: string
  fields: BuilderFormField[]
  selectedFieldId: string
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const maximumDraftBytes = 250_000
const modes = new Set(['scratch', 'import', 'extend'])
const views = new Set(['home', 'forms', 'builder', 'import'])
const formTypes = new Set([
  'BENEFICIARY_REGISTRATION',
  'TRAINING_SURVEY',
  'PRE_TEST',
  'POST_TEST',
  'OUTCOME_MONITORING',
  'ACTIVITY_MONITORING',
  'OTHER',
])
const fieldTypes = new Set([
  'text',
  'long_text',
  'integer',
  'decimal',
  'date',
  'single_select',
  'multi_select',
  'boolean',
])
const mappingStatuses = new Set(['mapped', 'unmapped', 'ignored', 'invalid'])

const isString = (value: unknown) => typeof value === 'string' && value.length <= 10_000

const isField = (value: unknown): value is BuilderFormField => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const field = value as Record<string, unknown>
  return (
    isString(field.id) &&
    isString(field.label) &&
    isString(field.code) &&
    typeof field.type === 'string' &&
    fieldTypes.has(field.type) &&
    typeof field.required === 'boolean' &&
    typeof field.metadataKey === 'boolean' &&
    typeof field.sadddField === 'boolean' &&
    isString(field.allowedValues) &&
    isString(field.minimumValue) &&
    isString(field.maximumValue) &&
    isString(field.minimumLength) &&
    isString(field.maximumLength) &&
    typeof field.mappingStatus === 'string' &&
    mappingStatuses.has(field.mappingStatus)
  )
}

const isDraft = (value: unknown): value is FormBuilderSessionDraft => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const draft = value as Record<string, unknown>
  return (
    draft.schemaVersion === 1 &&
    (draft.baseUpdatedAt === null || isString(draft.baseUpdatedAt)) &&
    typeof draft.mode === 'string' &&
    modes.has(draft.mode) &&
    typeof draft.view === 'string' &&
    views.has(draft.view) &&
    isString(draft.formTitle) &&
    isString(draft.formCode) &&
    typeof draft.formType === 'string' &&
    formTypes.has(draft.formType) &&
    isString(draft.projectId) &&
    isString(draft.journeyStage) &&
    isString(draft.linkedActivityId) &&
    Array.isArray(draft.fields) &&
    draft.fields.length <= 100 &&
    draft.fields.every(isField) &&
    isString(draft.selectedFieldId)
  )
}

export const formBuilderSessionDraftKey = (userId: string, formId: string | null) =>
  `pathways:form-builder-draft:v1:${userId}:${formId ?? 'new'}`

export function readFormBuilderSessionDraft(
  storage: SessionStorage,
  key: string,
  expectedBaseUpdatedAt: string | null,
) {
  try {
    const serialized = storage.getItem(key)
    if (!serialized || serialized.length > maximumDraftBytes) return null
    const value: unknown = JSON.parse(serialized)
    if (!isDraft(value) || value.baseUpdatedAt !== expectedBaseUpdatedAt) return null
    return value
  } catch {
    return null
  }
}

export function writeFormBuilderSessionDraft(
  storage: SessionStorage,
  key: string,
  draft: FormBuilderSessionDraft,
) {
  try {
    const serialized = JSON.stringify(draft)
    if (serialized.length <= maximumDraftBytes) storage.setItem(key, serialized)
  } catch {
    // Browser storage is a convenience only; inability to persist cannot alter form authority.
  }
}

export function clearFormBuilderSessionDraft(storage: SessionStorage, key: string) {
  try {
    storage.removeItem(key)
  } catch {
    // A failed cleanup does not change the server draft or its authorization.
  }
}
