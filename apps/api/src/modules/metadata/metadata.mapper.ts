import type { CreateFormRequest, FormFieldValidationContract } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import type { ApplicationIdentity } from '../../common/authz/application-identity'

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
  publishedAt: true,
  archivedAt: true,
  updatedAt: true,
  formField_form: { select: fieldSelection, orderBy: { sequenceNo: 'asc' as const } },
} satisfies Prisma.DigitalFormSelect

export type FormRow = Prisma.DigitalFormGetPayload<{ select: typeof formSelection }>

export function jsonStringArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

export function formFieldContract(field: FormFieldContractRow): FormFieldValidationContract {
  return {
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.isRequired,
    allowedValues: jsonStringArray(field.allowedValues),
    minimumValue: field.minimumValue?.toString(),
    maximumValue: field.maximumValue?.toString(),
    minimumDate: field.minimumDate?.toISOString().slice(0, 10),
    maximumDate: field.maximumDate?.toISOString().slice(0, 10),
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
  }
}

export function mapForm(form: FormRow, actor: ApplicationIdentity) {
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
    createdByCurrentUser: form.createdById === actor.userId,
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
  }
}

// The form field columns a validation contract reads.
export type FormFieldContractRow = Pick<
  FormRow['formField_form'][number],
  | 'code'
  | 'label'
  | 'dataType'
  | 'isRequired'
  | 'allowedValues'
  | 'minimumValue'
  | 'maximumValue'
  | 'minimumDate'
  | 'maximumDate'
  | 'minimumLength'
  | 'maximumLength'
>

// A published form payload cached under the fingerprint of its source rows.
export type CachedFormDefinition = { fingerprint: string; value: ReturnType<typeof mapForm> }
