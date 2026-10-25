import { z } from 'zod'

import { lengthString, strictIsoDateString, uuidString } from '../common/field-schemas'

export const activityEscalationStatuses = ['OPEN', 'FORWARDED', 'RESOLVED'] as const
export type ActivityEscalationStatus = (typeof activityEscalationStatuses)[number]
export const activityEscalationLevels = ['PROJECT', 'PROGRAM'] as const
export type ActivityEscalationLevel = (typeof activityEscalationLevels)[number]

// 10 to 2000 characters before and after trimming, so the database CHECK is never the first line.
const trimmedText = lengthString(10, 2000).refine(
  (value) => value.trim().length >= 10 && value.trim().length <= 2000,
  'must be 10 to 2000 characters after trimming',
)

// Body of POST /projects/:projectId/activities/:activityId/escalations.
export const createActivityEscalation = z
  .object({ clientMutationId: uuidString, reason: trimmedText })
  .strict()
export type CreateActivityEscalation = z.infer<typeof createActivityEscalation>

// Body of POST .../escalations/:escalationId/{forward,resolve,program-resolve}.
export const decideActivityEscalation = z
  .object({ note: trimmedText, expectedUpdatedAt: strictIsoDateString })
  .strict()
export type DecideActivityEscalation = z.infer<typeof decideActivityEscalation>

const id = z.guid()
const instant = z.string().datetime()
const note = z.string().max(2000)
const person = z.object({ id, name: z.string().max(200) }).strict()

export const activityEscalationResponse = z
  .object({
    id,
    projectId: id,
    activityId: id,
    reason: note,
    status: z.enum(activityEscalationStatuses),
    raisedBy: person,
    raisedAt: instant,
    forwardedBy: person.nullable(),
    forwardedAt: instant.nullable(),
    forwardNote: note.nullable(),
    resolvedBy: person.nullable(),
    resolvedAt: instant.nullable(),
    resolutionNote: note.nullable(),
    resolutionLevel: z.enum(activityEscalationLevels).nullable(),
    updatedAt: instant,
  })
  .strict()
export type ActivityEscalation = z.infer<typeof activityEscalationResponse>
