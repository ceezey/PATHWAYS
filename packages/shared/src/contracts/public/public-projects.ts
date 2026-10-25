import { z } from 'zod'

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
    publishedAt: z.string().datetime({ offset: true }),
  })
  .strict()
export type PublicProjectResponse = z.infer<typeof publicProjectResponse>

// Body of the four publication transitions; PublicService requires the summary on submit only.
export const publicationTransitionRequest = z
  .object({
    clientRequestId: z.guid(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    summary: z.string().trim().min(1).max(4000).optional(),
  })
  .strict()
export type PublicationTransitionRequest = z.infer<typeof publicationTransitionRequest>
export type PublicationOperation = 'SUBMIT' | 'APPROVE' | 'PUBLISH' | 'WITHDRAW'
