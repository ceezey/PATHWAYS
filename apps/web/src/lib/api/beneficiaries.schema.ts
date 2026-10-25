import {
  type BeneficiaryResponse,
  beneficiaryRegistrationDefinitionErrors,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { z } from 'zod'

import { PathwaysClientError } from '@/lib/api/core/request'
import type { BeneficiaryRecord, BeneficiaryRegistrationContext } from '@/types/pathways'

const field = z
  .object({
    id: z.guid(),
    code: z.string().max(64),
    label: z.string().max(160),
    dataType: z.enum([
      'TEXT',
      'LONG_TEXT',
      'INTEGER',
      'DECIMAL',
      'DATE',
      'BOOLEAN',
      'SELECT',
      'MULTIPLE_SELECT',
    ]),
    required: z.boolean(),
    metadataKey: z.boolean(),
    sadddField: z.boolean(),
    sequence: z.number().int().positive(),
    allowedValues: z.array(z.string().max(120)).max(100).nullable().optional(),
    minimumValue: z.string().nullable().optional(),
    maximumValue: z.string().nullable().optional(),
    minimumDate: z.string().nullable().optional(),
    maximumDate: z.string().nullable().optional(),
    minimumLength: z.number().int().nullable().optional(),
    maximumLength: z.number().int().nullable().optional(),
  })
  .strict()
const schema = z
  .object({
    projectId: z.guid(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    definitions: z
      .array(
        z
          .object({
            id: z.guid(),
            code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
            version: z.number().int().positive(),
            name: z.string().min(3).max(160),
            formType: z.literal('BENEFICIARY_REGISTRATION'),
            status: z.literal('PUBLISHED'),
            fields: z.array(field).min(1).max(100),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
export function parseRegistrationContext(
  value: unknown,
  projectId: string,
): BeneficiaryRegistrationContext {
  const result = schema.safeParse(value)
  if (!result.success || result.data.projectId !== projectId.toLowerCase())
    throw new Error('Invalid registration context response.')
  const { data } = result
  const date = new Date(`${data.businessDate}T00:00:00.000Z`)
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== data.businessDate ||
    new Set(data.definitions.map((definition) => definition.code)).size !==
      data.definitions.length ||
    data.definitions.some(
      (definition) =>
        beneficiaryRegistrationDefinitionErrors(definition.fields).length > 0 ||
        validateAndNormalizeFormData(definition.fields, {}, 'draft').errors.some(
          (error) => error.code === 'invalid_definition',
        ),
    )
  ) {
    throw new Error('Invalid registration context response.')
  }
  return data
}

// Whole years from a YYYY-MM-DD birth date to the enrollment date, or today without one.
const ageFromBirthDate = (birthDate?: string, asOf?: string) => {
  if (!birthDate) return null
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number)
  const [ay, am, ad] = (asOf ?? new Date().toISOString()).slice(0, 10).split('-').map(Number)
  if (!by || !ay) return null
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0)
}

export function mapBeneficiary(row: BeneficiaryResponse): BeneficiaryRecord {
  const sex = {
    FEMALE: 'Female',
    MALE: 'Male',
    OTHER: 'Other',
    PREFER_NOT_TO_SAY: 'Prefer not to say',
    NOT_SPECIFIED: 'Not specified',
  } as const
  const disability = {
    WITH_DISABILITY: 'With disability',
    WITHOUT_DISABILITY: 'Without disability',
    NOT_SPECIFIED: 'Not specified',
  } as const
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.code !== 'string' ||
    typeof row.displayName !== 'string' ||
    !(row.sex in sex) ||
    !(row.disabilityStatus in disability) ||
    !Object.hasOwn(row, 'enrollment') ||
    (row.enrollment !== null &&
      (!row.enrollment ||
        !['ACTIVE', 'COMPLETED', 'DROPPED', 'TRANSFERRED', 'INACTIVE'].includes(
          row.enrollment.status,
        ))) ||
    !Array.isArray(row.consentProvenance)
  ) {
    throw new PathwaysClientError('Invalid beneficiary response.', 'network')
  }
  const enrollmentStatus =
    row.enrollment === null
      ? 'Not recorded'
      : row.enrollment.status === 'COMPLETED'
        ? 'Completed'
        : row.enrollment.status === 'DROPPED' ||
            row.enrollment.status === 'TRANSFERRED' ||
            row.enrollment.status === 'INACTIVE'
          ? 'Exited'
          : 'Active'
  const location =
    [row.locationBarangay, row.locationCityMunicipality, row.locationProvince]
      .filter(Boolean)
      .join(', ') || 'Not recorded'
  // Rows registered with a birth date store no age, so derive it at enrollment like the API does.
  const age =
    row.ageAtRegistration ?? ageFromBirthDate(row.birthDate, row.enrollment?.enrollmentDate)
  const ageGroup =
    age === null
      ? 'Unknown'
      : age <= 9
        ? '5-9'
        : age <= 14
          ? '10-14'
          : age <= 17
            ? '15-17'
            : age <= 24
              ? '18-24'
              : '25+'
  return {
    id: row.id,
    code: row.code,
    subjectType: row.subjectType,
    displayName: row.displayName,
    projectIds: [row.projectId],
    location,
    sex: sex[row.sex],
    ageGroup,
    disabilityStatus: disability[row.disabilityStatus],
    enrollmentStatus,
    firstName: row.firstName ?? '',
    middleName: row.middleName ?? undefined,
    lastName: row.lastName ?? '',
    birthDate: row.birthDate,
    age: age ?? undefined,
    province: row.locationProvince ?? '',
    city: row.locationCityMunicipality ?? '',
    barangay: row.locationBarangay ?? '',
    consentToParticipate: row.consentRecorded,
    consentToStoreData: row.dataProcessingConsentRecorded,
    isMinor: row.isMinor,
    guardianConsent: row.guardianConsentRecorded,
    enrollments: row.enrollment
      ? [
          {
            id: row.enrollment.id,
            projectId: row.projectId,
            status: enrollmentStatus,
            enrolledAt: row.enrollment.enrollmentDate,
            followUpStatus: 'Not recorded',
          },
        ]
      : [],
    participation: [],
    ...(row.progress ? { progress: row.progress } : {}),
    assessments: [],
    notes: [],
    updatedAt: row.updatedAt,
    consentProvenance: row.consentProvenance,
  }
}
