import { z } from 'zod'

// The approver's preview marks every count below this; public pages still show exact counts (G-04).
export const PUBLIC_SMALL_CELL_REVIEW_THRESHOLD = 5

// The four keys are fixed by migration 0097; only their on-screen wording may change.
export const publicationApprovalChecklist = z
  .object({
    smallGroupsChecked: z.literal(true),
    noIdentifiableMinor: z.literal(true),
    imageConsentOnFile: z.literal(true),
    pinPositionsAcceptable: z.literal(true),
  })
  .strict()
export type PublicationApprovalChecklist = z.infer<typeof publicationApprovalChecklist>

export const mediaApprovalChecklist = z
  .object({ noIdentifiableMinor: z.literal(true), imageConsentOnFile: z.literal(true) })
  .strict()
export type MediaApprovalChecklist = z.infer<typeof mediaApprovalChecklist>

// Body of POST projects/:projectId/public-media/:mediaId/approve.
export const approvePublicMediaRequest = z.object({ checklist: mediaApprovalChecklist }).strict()
export type ApprovePublicMediaRequest = z.infer<typeof approvePublicMediaRequest>
