import { z } from 'zod'

import {
  MAX_BENEFICIARY_MEDIA_FILES,
  beneficiaryMediaContentTypes,
  beneficiaryMediaFile,
} from '../beneficiaries/beneficiary-media-requests'

// Staff upload types for the public media queue: the beneficiary media types.
export const publicMediaContentTypes = beneficiaryMediaContentTypes

// Body of POST projects/:projectId/public-media/reservations.
export const reservePublicMediaRequest = z
  .object({ files: z.array(beneficiaryMediaFile).min(1).max(MAX_BENEFICIARY_MEDIA_FILES) })
  .strict()
export type ReservePublicMediaRequest = z.infer<typeof reservePublicMediaRequest>

// Body of POST projects/:projectId/public-media/:mediaId/reject.
export const publicMediaRejectRequest = z
  .object({ reason: z.string().trim().min(1).max(2000) })
  .strict()
export type PublicMediaRejectRequest = z.infer<typeof publicMediaRejectRequest>

// One photo or video the staff picker and the approval queue show; pickable follows the SQL rule.
export const publicMediaListItem = z.object({
  id: z.string(),
  type: z.enum(['PHOTO', 'VIDEO']),
  contentType: z.string(),
  fileName: z.string(),
  source: z.enum(['ACTIVITY', 'BENEFICIARY', 'UPLOAD']),
  status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),
  publicStatus: z.enum(['PRIVATE', 'FOR_REVIEW', 'APPROVED']),
  submittedById: z.string(),
  publicSubmittedById: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  pickable: z.boolean(),
})
export type PublicMediaListItem = z.infer<typeof publicMediaListItem>

// The most rows GET projects/:projectId/public-media returns, queued rows first.
export const MAX_PUBLIC_MEDIA_LISTED = 500

// Body of GET projects/:projectId/public-media; the flag says beneficiary media was left out until a fresh step-up.
export const publicMediaListResponse = z.object({
  items: z.array(publicMediaListItem).max(MAX_PUBLIC_MEDIA_LISTED),
  beneficiaryMediaNeedsStepUp: z.boolean(),
})
export type PublicMediaListResponse = z.infer<typeof publicMediaListResponse>
