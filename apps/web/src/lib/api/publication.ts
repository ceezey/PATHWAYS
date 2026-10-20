import { type PublicationTransitionRequest, publicProjectResponse } from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'

const uuid = z.string().uuid()
const publicationSchema = z
  .object({
    revision: z.number().int().positive(),
    state: z.enum(['FOR_REVIEW', 'APPROVED', 'PUBLISHED']),
    summary: z.string().min(1).max(4000),
    snapshot: publicProjectResponse.omit({ publishedAt: true }),
    submittedById: uuid,
    approvedById: uuid.nullable(),
    publishedById: uuid.nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
const publicationReceipt = publicationSchema.pick({ revision: true, state: true, updatedAt: true })

export const publicationClient = {
  get: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/publication`,
      z
        .object({
          publication: publicationSchema.refine((row) => row.snapshot.id === id).nullable(),
        })
        .strict(),
      { signal },
    ).then((body) => body.publication),
  transition: (
    id: string,
    operation: 'submit' | 'approve' | 'publish' | 'withdraw',
    body: PublicationTransitionRequest,
    signal?: AbortSignal,
  ) =>
    ownedJsonRead(`${projectPath(id)}/publication/${operation}`, publicationReceipt, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),
}
