import { z } from 'zod'

// One photo or video the public page shows; the database checks ids are unique and pickable.
export const publicMediaItem = z
  .object({
    id: z.guid(),
    type: z.enum(['PHOTO', 'VIDEO']),
    contentType: z.string().regex(/^(image|video)\/[a-z0-9.+-]+$/),
    caption: z.string().min(1).max(300),
  })
  .strict()

export const publicView = z.enum(['kpi', 'saddd', 'participation', 'timeline', 'map'])
export type PublicView = z.infer<typeof publicView>

// One approved public project snapshot; the API and the web both parse it as the anonymous allowlist.
export const publicProjectResponse = z
  .object({
    id: z.guid(),
    title: z.string().min(1).max(300),
    code: z.string().max(100),
    approvedSummary: z.string().min(1).max(4000),
    area: z.string().max(500).nullable(),
    sector: z.string().max(300).nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    media: z.array(publicMediaItem).max(24),
    views: z.array(publicView).max(5),
    publishedAt: z.string().datetime({ offset: true }),
  })
  .strict()
export type PublicProjectResponse = z.infer<typeof publicProjectResponse>

// What the submitter picks for the public page; the database fills type and content type.
export const publicationSelection = z
  .object({
    media: z
      .array(z.object({ id: z.guid(), caption: z.string().trim().min(1).max(300) }).strict())
      .max(24),
    views: z.array(publicView).max(5),
  })
  .strict()
export type PublicationSelection = z.infer<typeof publicationSelection>

// Body of the four publication transitions; PublicService requires the summary and selection on submit only.
export const publicationTransitionRequest = z
  .object({
    clientRequestId: z.guid(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    summary: z.string().trim().min(1).max(4000).optional(),
    selection: publicationSelection.optional(),
  })
  .strict()
export type PublicationTransitionRequest = z.infer<typeof publicationTransitionRequest>
export type PublicationOperation = 'SUBMIT' | 'APPROVE' | 'PUBLISH' | 'WITHDRAW'
