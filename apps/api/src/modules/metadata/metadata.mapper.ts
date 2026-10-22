import type { CreateFormRequest, FieldIntakeRule, FormResponse } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { jsonStringArray } from '../../common/forms/form-field-contract'

export const fieldSelection = {
  id: true,
  code: true,
  label: true,
  dataType: true,
  isRequired: true,
  isMetadataKey: true,
  isSadddField: true,
  allowedValues: true,
  minimumValue: true,
  maximumValue: true,
  minimumDate: true,
  maximumDate: true,
  minimumLength: true,
  maximumLength: true,
  sourceNames: true,
  valueAliases: true,
  importDefault: true,
  rule: true,
  sequenceNo: true,
} satisfies Prisma.FormFieldSelect

export const formSelection = {
  id: true,
  projectId: true,
  code: true,
  version: true,
  name: true,
  description: true,
  formType: true,
  status: true,
  activityId: true,
  journeyStageId: true,
  createdById: true,
  lastEditedById: true,
  publishedAt: true,
  archivedAt: true,
  updatedAt: true,
  formField_form: { select: fieldSelection, orderBy: { sequenceNo: 'asc' as const } },
} satisfies Prisma.DigitalFormSelect

export type FormRow = Prisma.DigitalFormGetPayload<{ select: typeof formSelection }>

// The stored intake columns in request shape; the database checks guarantee their structure.
function intakeProperties(field: FormRow['formField_form'][number]) {
  return {
    sourceNames: field.sourceNames,
    valueAliases: (field.valueAliases ??
      undefined) as CreateFormRequest['fields'][number]['valueAliases'],
    importDefault: field.importDefault ?? undefined,
    rule: (field.rule ?? undefined) as FieldIntakeRule | undefined,
  }
}

export function mapForm(form: FormRow, actor: ApplicationIdentity): FormResponse {
  return {
    id: form.id,
    projectId: form.projectId,
    code: form.code,
    version: form.version,
    name: form.name,
    description: form.description,
    formType: form.formType,
    status: form.status,
    activityId: form.activityId,
    journeyStageId: form.journeyStageId,
    publishedAt: form.publishedAt?.toISOString(),
    archivedAt: form.archivedAt?.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
    createdByCurrentUser: form.createdById === actor.userId || form.lastEditedById === actor.userId,
    fields: form.formField_form.map((field) => ({
      id: field.id,
      code: field.code,
      label: field.label,
      dataType: field.dataType,
      required: field.isRequired,
      metadataKey: field.isMetadataKey,
      sadddField: field.isSadddField,
      allowedValues: jsonStringArray(field.allowedValues),
      minimumValue: field.minimumValue?.toString(),
      maximumValue: field.maximumValue?.toString(),
      minimumDate: field.minimumDate?.toISOString().slice(0, 10),
      maximumDate: field.maximumDate?.toISOString().slice(0, 10),
      minimumLength: field.minimumLength,
      maximumLength: field.maximumLength,
      ...intakeProperties(field),
      sequence: field.sequenceNo,
    })),
  }
}

export function fieldInput(
  field: FormRow['formField_form'][number],
): CreateFormRequest['fields'][number] {
  return {
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.isRequired,
    metadataKey: field.isMetadataKey,
    sadddField: field.isSadddField,
    allowedValues: jsonStringArray(field.allowedValues) ?? undefined,
    minimumValue: field.minimumValue?.toString(),
    maximumValue: field.maximumValue?.toString(),
    minimumDate: field.minimumDate?.toISOString().slice(0, 10),
    maximumDate: field.maximumDate?.toISOString().slice(0, 10),
    minimumLength: field.minimumLength ?? undefined,
    maximumLength: field.maximumLength ?? undefined,
    ...intakeProperties(field),
  }
}

// A published form payload cached under the fingerprint of its source rows.
export type CachedFormDefinition = { fingerprint: string; value: ReturnType<typeof mapForm> }
