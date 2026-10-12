import { z } from 'zod'

import { lengthString, strictIsoDateString, uuidString } from '../common/field-schemas'

// Body of POST /projects/:projectId/activities/:activityId/extension-requests.
export const createActivityExtensionRequest = z
  .object({
    clientMutationId: uuidString,
    requestedEndDate: strictIsoDateString.refine(
      (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
      'must be a calendar day written YYYY-MM-DD',
    ),
    reason: lengthString(10, 2000),
  })
  .strict()
export type CreateActivityExtensionRequest = z.infer<typeof createActivityExtensionRequest>

// Body of POST .../extension-requests/:requestId/verify.
export const verifyActivityExtensionRequest = z
  .object({
    decision: z.enum(['VERIFY', 'RETURN']),
    note: lengthString(10, 2000),
    expectedUpdatedAt: strictIsoDateString,
  })
  .strict()
export type VerifyActivityExtensionRequest = z.infer<typeof verifyActivityExtensionRequest>

// Body of POST .../extension-requests/:requestId/decide.
export const decideActivityExtensionRequest = z
  .object({
    clientMutationId: uuidString,
    decision: z.enum(['APPROVE', 'DECLINE']),
    note: lengthString(10, 2000),
    expectedUpdatedAt: strictIsoDateString,
    activityExpectedUpdatedAt: strictIsoDateString,
  })
  .strict()
export type DecideActivityExtensionRequest = z.infer<typeof decideActivityExtensionRequest>
