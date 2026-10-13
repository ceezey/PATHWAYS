import { z } from 'zod'

// Response shapes of the journey routes, used as types and never parsed at runtime.

// One stage of GET and PUT projects/:projectId/journey-stages; the type carries the display label.
export const journeyStageResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  code: z.string(),
  name: z.string(),
  order: z.number().int(),
  type: z.enum(['Entry', 'Core', 'Branch', 'Follow-Up']),
  parentStageId: z.string().optional(),
  terminal: z.boolean(),
  mappedActivityIds: z.array(z.string()),
  description: z.string(),
  archived: z.boolean(),
  updatedAt: z.string(),
})
export type JourneyStageResponse = z.infer<typeof journeyStageResponse>

const beneficiaryJourneyEventResponse = z.object({
  id: z.string(),
  eventType: z.enum([
    'ENROLLMENT',
    'PARTICIPATION',
    'PROGRESS_UPDATE',
    'COMPLETION',
    'FOLLOW_UP',
    'DROPOUT',
    'TRANSFER',
  ]),
  eventDate: z.string(),
  description: z.string().nullable(),
  note: z.string().nullable(),
  stageId: z.string().nullable(),
  stageCodeSnapshot: z.string().nullable(),
  stageNameSnapshot: z.string().nullable(),
  activityId: z.string().nullable(),
  activityCodeSnapshot: z.string().nullable(),
  activityTitleSnapshot: z.string().nullable(),
  participationId: z.string().nullable(),
  participation: z
    .object({
      attendanceStatus: z.enum(['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED']),
      progressStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP']),
    })
    .nullable(),
  correctsEventId: z.string().nullable(),
  correctionReason: z.string().nullable(),
  recordedAt: z.string(),
  recordedBy: z.string(),
})
export type BeneficiaryJourneyEventResponse = z.infer<typeof beneficiaryJourneyEventResponse>

// Body of the GET beneficiaries/projects/:projectId/:beneficiaryId/journey answer.
export const beneficiaryJourneyResponse = z.object({
  projectId: z.string(),
  beneficiaryId: z.string(),
  enrollmentId: z.string(),
  enrollmentStatus: z.enum(['ACTIVE', 'COMPLETED', 'DROPPED', 'TRANSFERRED', 'INACTIVE']),
  events: z.array(beneficiaryJourneyEventResponse),
})
export type BeneficiaryJourneyResponse = z.infer<typeof beneficiaryJourneyResponse>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/journey/events answer.
export const recordJourneyEventResponse = z.object({
  enrollmentId: z.string(),
  eventType: z.enum(['COMPLETION', 'FOLLOW_UP', 'DROPOUT', 'TRANSFER']),
  eventDate: z.string(),
})
export type RecordJourneyEventResponse = z.infer<typeof recordJourneyEventResponse>

// Body of the POST beneficiaries/projects/:projectId/:beneficiaryId/journey/events/:eventId/corrections answer.
export const correctJourneyEventResponse = z.object({ id: z.string() })
export type CorrectJourneyEventResponse = z.infer<typeof correctJourneyEventResponse>
