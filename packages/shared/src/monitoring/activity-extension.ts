import { z } from 'zod'
import { isCalendarDate } from './metric-math'

export const activityExtensionStatuses = [
  'PENDING',
  'VERIFIED',
  'RETURNED',
  'APPROVED',
  'DECLINED',
] as const
export type ActivityExtensionStatus = (typeof activityExtensionStatuses)[number]

const id = z.string().uuid()
const day = z.string().refine(isCalendarDate)
const instant = z.string().datetime()
const note = z.string().max(2000)
const person = z.object({ id, name: z.string().max(200) }).strict()

export const activityExtensionSchema = z
  .object({
    id,
    projectId: id,
    activityId: id,
    currentEndDate: day.nullable(),
    requestedEndDate: day,
    reason: note,
    status: z.enum(activityExtensionStatuses),
    requestedBy: person,
    requestedAt: instant,
    verifiedBy: person.nullable(),
    verifiedAt: instant.nullable(),
    verificationNote: note.nullable(),
    decidedBy: person.nullable(),
    decidedAt: instant.nullable(),
    decisionNote: note.nullable(),
    updatedAt: instant,
  })
  .strict()
export type ActivityExtension = z.infer<typeof activityExtensionSchema>
