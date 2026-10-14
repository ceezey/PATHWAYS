import { z } from 'zod'

import { sadddAgeBands } from '../../monitoring/metric-contract'
import {
  isoDateString,
  lengthString,
  strictIsoDateString,
  trimmedInput,
  uuidString,
} from '../common/field-schemas'

const beneficiarySexes = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'] as const
const disabilityStatuses = ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'] as const

// Query of GET beneficiaries/projects/:projectId; limit defaults to 25 and arrives as a string.
export const beneficiaryListQuery = z
  .object({
    search: trimmedInput(lengthString(1, 80)).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).nullish(),
    sex: z.enum(beneficiarySexes).nullish(),
    disabilityStatus: z.enum(disabilityStatuses).nullish(),
    ageBand: z.enum(sadddAgeBands).nullish(),
    enrollmentStatus: z.enum(['ACTIVE', 'COMPLETED', 'EXITED']).nullish(),
    cursor: uuidString.nullish(),
    limit: z.preprocess(
      (value) => (value === undefined ? 25 : Number(value)),
      z.number().int().min(1).max(50),
    ),
  })
  .strict()
export type BeneficiaryListQuery = z.infer<typeof beneficiaryListQuery>

// Body of POST beneficiaries/projects/:projectId/registrations.
export const registerBeneficiaryRequest = z
  .object({
    formId: uuidString,
    clientRegistrationId: uuidString,
    values: z.record(z.string(), z.unknown()),
  })
  .strict()
export type RegisterBeneficiaryRequest = z.infer<typeof registerBeneficiaryRequest>

// Body of PATCH beneficiaries/projects/:projectId/:beneficiaryId; key order is the audited field order.
export const updateBeneficiaryRequest = z
  .object({
    subjectType: z.enum(['INDIVIDUAL', 'GROUP', 'COMMUNITY']),
    displayName: lengthString(1, 160).nullish(),
    firstName: lengthString(1, 120).nullish(),
    middleName: lengthString(1, 120).nullish(),
    lastName: lengthString(1, 120).nullish(),
    sex: z.enum(beneficiarySexes),
    birthDate: strictIsoDateString.nullish(),
    ageAtRegistration: z.number().int().min(0).max(130).nullish(),
    disabilityStatus: z.enum(disabilityStatuses),
    locationBarangay: lengthString(1, 160).nullish(),
    locationCityMunicipality: lengthString(1, 160).nullish(),
    locationProvince: lengthString(1, 160).nullish(),
    expectedUpdatedAt: isoDateString,
  })
  .strict()
export type UpdateBeneficiaryRequest = z.infer<typeof updateBeneficiaryRequest>

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/archive.
export const archiveBeneficiaryRequest = z.object({ expectedUpdatedAt: isoDateString }).strict()
export type ArchiveBeneficiaryRequest = z.infer<typeof archiveBeneficiaryRequest>

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/enrollments.
export const enrollBeneficiaryRequest = z.object({ enrollmentDate: strictIsoDateString }).strict()
export type EnrollBeneficiaryRequest = z.infer<typeof enrollBeneficiaryRequest>

// Body of POST beneficiaries/projects/:projectId/duplicate-candidates/resolve.
export const resolveDuplicateRequest = z
  .object({
    leftId: uuidString,
    rightId: uuidString,
    decision: z.enum(['KEEP_DISTINCT', 'LINK']),
  })
  .strict()
export type ResolveDuplicateRequest = z.infer<typeof resolveDuplicateRequest>
