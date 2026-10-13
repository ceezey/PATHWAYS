import { z } from 'zod'

import type { FormFieldValidationContract } from '../../validation/form-data'
import { beneficiarySexes, disabilityStatuses } from './beneficiary-requests'

// Response shapes of the beneficiary routes, used as types and never parsed at runtime.

// Directory summary of one enrollment; restricted when the caller cannot read journeys.
export const beneficiaryProgressResponse = z.discriminatedUnion('restricted', [
  z.object({ restricted: z.literal(true) }),
  z.object({
    restricted: z.literal(false),
    lastParticipation: z
      .object({ activityId: z.string(), title: z.string(), date: z.string() })
      .nullable(),
    stage: z.object({ code: z.string(), name: z.string(), progressPercent: z.number() }).nullable(),
  }),
])
export type BeneficiaryProgressResponse = z.infer<typeof beneficiaryProgressResponse>

// One beneficiary as the list, detail, register and update routes return it; progress is on list and detail only.
export const beneficiaryResponse = z.object({
  id: z.string(),
  code: z.string(),
  subjectType: z.enum(['INDIVIDUAL', 'GROUP', 'COMMUNITY', 'UNSPECIFIED_LEGACY']),
  displayName: z.string(),
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  sex: z.enum(beneficiarySexes),
  birthDate: z.string().optional(),
  ageAtRegistration: z.number().int().nullable(),
  disabilityStatus: z.enum(disabilityStatuses),
  locationBarangay: z.string().nullable(),
  locationCityMunicipality: z.string().nullable(),
  locationProvince: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  consentRecorded: z.boolean(),
  dataProcessingConsentRecorded: z.boolean(),
  isMinor: z.boolean(),
  guardianConsentRecorded: z.boolean(),
  projectId: z.string(),
  enrollment: z
    .object({
      id: z.string(),
      projectId: z.string(),
      enrollmentDate: z.string(),
      status: z.enum(['ACTIVE', 'COMPLETED', 'DROPPED', 'TRANSFERRED', 'INACTIVE']),
      endedDate: z.string().optional(),
      endReason: z.string().nullable(),
      updatedAt: z.string(),
    })
    .nullable(),
  consentProvenance: z.array(
    z.object({
      kind: z.enum(['PARTICIPATION', 'DATA_PROCESSING', 'GUARDIAN']),
      source: z.enum(['DIRECT_ENTRY', 'IMPORTED_DATASET']),
      recordedAt: z.string(),
    }),
  ),
  progress: beneficiaryProgressResponse.optional(),
  updatedAt: z.string(),
})
export type BeneficiaryResponse = z.infer<typeof beneficiaryResponse>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/archive answer.
export const archiveBeneficiaryResponse = z.object({
  id: z.string(),
  status: z.literal('ARCHIVED'),
  archivedAt: z.string(),
})
export type ArchiveBeneficiaryResponse = z.infer<typeof archiveBeneficiaryResponse>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/enrollments answer.
export const enrollBeneficiaryResponse = z.object({
  id: z.string(),
  enrollmentDate: z.string(),
  status: z.string(),
})
export type EnrollBeneficiaryResponse = z.infer<typeof enrollBeneficiaryResponse>

const duplicateProfileResponse = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  birthDate: z.string(),
  location: z.string(),
  updatedAt: z.string(),
})
export type DuplicateProfileResponse = z.infer<typeof duplicateProfileResponse>

// One pair of enrolled profiles that GET beneficiaries/projects/:projectId/duplicate-candidates lists.
export const duplicateCandidatePairResponse = z.object({
  left: duplicateProfileResponse,
  right: duplicateProfileResponse,
})
export type DuplicateCandidatePairResponse = z.infer<typeof duplicateCandidatePairResponse>

// A plain type, not a schema: the web parser checks bounds, the business date and the definition rules that no schema here expresses.
export interface RegistrationContextResponse {
  projectId: string
  businessDate: string
  definitions: {
    id: string
    code: string
    version: number
    name: string
    formType: 'BENEFICIARY_REGISTRATION'
    status: 'PUBLISHED'
    fields: (FormFieldValidationContract & {
      id: string
      metadataKey: boolean
      sadddField: boolean
      sequence: number
    })[]
  }[]
}
