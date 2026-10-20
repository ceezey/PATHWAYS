import { z } from 'zod'

import { lengthString, strictIsoDateString, trimmedInput } from '../common/field-schemas'

const contactNumberPattern = /^(?:[+()\-\s0-9]{7,30})?$/

// Body of PATCH profile.
export const updateOwnProfileRequest = z
  .object({
    fullName: trimmedInput(lengthString(2, 80)),
    contactNumber: trimmedInput(
      lengthString(0, 30).refine(
        (value) => contactNumberPattern.test(value),
        'must be a contact number',
      ),
    ),
    expectedUpdatedAt: strictIsoDateString,
  })
  .strict()
export type UpdateOwnProfileRequest = z.infer<typeof updateOwnProfileRequest>

// The caller's own profile as GET and PATCH profile return it; the web parses it on every read.
export const ownProfileResponse = z
  .object({
    fullName: z.string(),
    contactNumber: z.string().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type OwnProfileResponse = z.infer<typeof ownProfileResponse>
