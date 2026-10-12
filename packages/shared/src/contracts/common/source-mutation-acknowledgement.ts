import { z } from 'zod'

// Receipt the source mutation routes answer with when a retry replays a committed request or accompanies a new record.
export const sourceMutationAcknowledgement = z.object({
  requestId: z.string(),
  committed: z.literal(true),
  replayed: z.boolean(),
})
export type SourceMutationAcknowledgement = z.infer<typeof sourceMutationAcknowledgement>
