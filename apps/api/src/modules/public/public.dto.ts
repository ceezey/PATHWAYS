import { z } from 'zod'

export const publicProjectSchema = z
  .object({
    id: z.string().uuid(),
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
export const publicationInputSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    summary: z.string().trim().min(1).max(4000).optional(),
  })
  .strict()
export type PublicationOperation = 'SUBMIT' | 'APPROVE' | 'PUBLISH' | 'WITHDRAW'
