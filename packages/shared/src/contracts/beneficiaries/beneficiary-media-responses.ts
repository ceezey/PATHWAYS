import { z } from 'zod'

// Response shapes of the beneficiary media routes, used as types and never parsed at runtime.

// One ready file of GET beneficiaries/projects/:projectId/:beneficiaryId/media.
export const beneficiaryMediaItemResponse = z.object({
  id: z.string(),
  type: z.enum(['DOCUMENT', 'PHOTO', 'VIDEO', 'PROGRESS_PROOF', 'COMPLETION_PROOF', 'OTHER']),
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number(),
  description: z.string().nullable(),
  submittedAt: z.string(),
  submittedBy: z.string(),
  storageReady: z.boolean(),
})
export type BeneficiaryMediaItemResponse = z.infer<typeof beneficiaryMediaItemResponse>

// Body of the GET beneficiaries/projects/:projectId/:beneficiaryId/media/limits answer.
export const beneficiaryMediaLimitsResponse = z.object({
  maxFiles: z.number(),
  maxFileBytes: z.number(),
  contentTypes: z.array(z.string()),
})
export type BeneficiaryMediaLimitsResponse = z.infer<typeof beneficiaryMediaLimitsResponse>

const beneficiaryMediaReservedFileResponse = z.object({
  mediaId: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number(),
  sha256: z.string(),
  uploadUrl: z.string().nullable(),
})
export type BeneficiaryMediaReservedFileResponse = z.infer<
  typeof beneficiaryMediaReservedFileResponse
>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/media/reservations answer.
export const beneficiaryMediaReservationResponse = z.object({
  files: z.array(beneficiaryMediaReservedFileResponse),
})
export type BeneficiaryMediaReservationResponse = z.infer<
  typeof beneficiaryMediaReservationResponse
>
