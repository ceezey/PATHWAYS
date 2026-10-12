import { z } from 'zod'

import { lengthString, strictIsoDateString, trimmedInput } from '../common/field-schemas'
import { recordCodeInput, storedProjectStatuses } from '../projects/project-requests'

// Body of POST /programs.
export const createProgramRequest = z
  .object({
    code: recordCodeInput,
    name: trimmedInput(lengthString(3, 160)),
    description: lengthString(0, 2000).nullish(),
    startDate: strictIsoDateString.nullish(),
    endDate: strictIsoDateString.nullish(),
    status: z.enum(storedProjectStatuses),
  })
  .strict()
export type CreateProgramRequest = z.infer<typeof createProgramRequest>
