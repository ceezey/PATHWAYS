import { z } from 'zod'

import {
  hasUniqueItems,
  isoDateString,
  lengthString,
  strictIsoDateString,
  trimmedInput,
  uuidString,
} from '../common/field-schemas'

const stageCodePattern = /^[A-Z0-9][A-Z0-9._-]*$/

// One stage of PUT projects/:projectId/journey-stages; the code is trimmed and upper-cased first.
export const journeyStageInput = z
  .object({
    id: uuidString.nullish(),
    code: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
      lengthString(2, 40).refine(
        (value) => stageCodePattern.test(value),
        'Stage codes use capital letters, digits, dots, dashes or underscores.',
      ),
    ),
    name: lengthString(2, 160),
    order: z.number().int().min(1).max(500),
    type: z.enum(['ENTRY', 'CORE', 'BRANCH', 'FOLLOW_UP']),
    parentStageId: uuidString.nullish(),
    terminal: z.boolean().nullish().default(false),
    description: lengthString(0, 2000).nullish(),
    mappedActivityIds: z
      .array(uuidString)
      .max(100)
      .refine(hasUniqueItems, 'must not repeat an activity'),
    expectedUpdatedAt: isoDateString.nullish(),
  })
  .strict()
export type JourneyStageInput = z.infer<typeof journeyStageInput>

// Body of PUT projects/:projectId/journey-stages.
export const saveJourneyStagesRequest = z
  .object({ stages: z.array(journeyStageInput).max(100) })
  .strict()
export type SaveJourneyStagesRequest = z.infer<typeof saveJourneyStagesRequest>

const journeyNote = trimmedInput(lengthString(1, 1000)).nullish()

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/journey/events.
export const recordJourneyEventRequest = z
  .object({
    eventType: z.enum(['COMPLETION', 'FOLLOW_UP', 'DROPOUT', 'TRANSFER']),
    eventDate: strictIsoDateString,
    description: lengthString(1, 2000),
    stageId: uuidString.nullish(),
    destinationProjectId: uuidString.nullish(),
    note: journeyNote,
  })
  .strict()
export type RecordJourneyEventRequest = z.infer<typeof recordJourneyEventRequest>

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/journey/events/:eventId/corrections.
export const correctJourneyEventRequest = z
  .object({
    eventDate: strictIsoDateString,
    description: lengthString(1, 2000),
    reason: lengthString(1, 1000),
    note: journeyNote,
    stageId: uuidString.nullish(),
  })
  .strict()
export type CorrectJourneyEventRequest = z.infer<typeof correctJourneyEventRequest>
