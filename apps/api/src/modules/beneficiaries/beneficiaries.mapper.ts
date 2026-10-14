import type { Prisma } from '@prisma/client'

import type { FormFieldValidationContract } from '@pathways/shared'

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
  sequenceNo: true,
} satisfies Prisma.FormFieldSelect

type FieldRow = Prisma.FormFieldGetPayload<{ select: typeof fieldSelection }>

function jsonStrings(value: Prisma.JsonValue | null) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

export function contract(field: FieldRow): FormFieldValidationContract {
  return {
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.isRequired,
    allowedValues: jsonStrings(field.allowedValues),
    minimumValue: field.minimumValue?.toString(),
    maximumValue: field.maximumValue?.toString(),
    minimumDate: field.minimumDate?.toISOString().slice(0, 10),
    maximumDate: field.maximumDate?.toISOString().slice(0, 10),
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
  }
}

export function scopedIncludes(organizationId: string, projectId: string) {
  return {
    beneficiaryProjectEnrollment_beneficiary: {
      where: { organizationId, projectId },
      select: {
        id: true,
        projectId: true,
        enrollmentDate: true,
        status: true,
        endedDate: true,
        endReason: true,
        updatedAt: true,
      },
      take: 1,
    },
    beneficiaryConsentRecord_beneficiary: {
      where: { organizationId, projectId },
      select: { kind: true, source: true, recordedAt: true },
      orderBy: { recordedAt: 'desc' as const },
      take: 10,
    },
  } satisfies Prisma.BeneficiaryInclude
}

// A beneficiary row read with the scoped enrollment and consent includes.
export type BeneficiaryRow = Prisma.BeneficiaryGetPayload<{
  include: ReturnType<typeof scopedIncludes>
}>

export function mapBeneficiary(row: BeneficiaryRow, projectId: string) {
  const enrollment = row.beneficiaryProjectEnrollment_beneficiary[0]
  return {
    id: row.id,
    code: row.code,
    subjectType: row.subjectType,
    displayName: row.displayName ?? row.code,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    sex: row.sex,
    birthDate: row.birthDate?.toISOString().slice(0, 10),
    ageAtRegistration: row.ageAtRegistration,
    disabilityStatus: row.disabilityStatus,
    locationBarangay: row.locationBarangay,
    locationCityMunicipality: row.locationCityMunicipality,
    locationProvince: row.locationProvince,
    status: row.status,
    consentRecorded: row.consentRecorded,
    dataProcessingConsentRecorded: row.dataProcessingConsentRecorded,
    isMinor: row.isMinor,
    guardianConsentRecorded: row.guardianConsentRecorded,
    projectId,
    enrollment: enrollment
      ? {
          id: enrollment.id,
          projectId,
          enrollmentDate: enrollment.enrollmentDate.toISOString().slice(0, 10),
          status: enrollment.status,
          endedDate: enrollment.endedDate?.toISOString().slice(0, 10),
          endReason: enrollment.endReason,
          updatedAt: enrollment.updatedAt.toISOString(),
        }
      : null,
    consentProvenance: row.beneficiaryConsentRecord_beneficiary.map((entry) => ({
      kind: entry.kind,
      source: entry.source,
      recordedAt: entry.recordedAt.toISOString(),
    })),
    updatedAt: row.updatedAt.toISOString(),
  }
}
