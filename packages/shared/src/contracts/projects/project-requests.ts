import { z } from 'zod'

import {
  countInput,
  hasUniqueItems,
  isoDateString,
  lengthString,
  pesoAmountInput,
  strictIsoDateString,
  trimmedInput,
  uuidString,
  validatorLength,
} from '../common/field-schemas'

// Status codes stored on projects and programs.
export const storedProjectStatuses = [
  'PLANNED',
  'ONGOING',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
] as const
export type StoredProjectStatus = (typeof storedProjectStatuses)[number]

const recordCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

// A project or program code: trimmed and upper-cased, then 2 to 40 letters, digits, hyphens or underscores.
export const recordCodeInput = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.string().refine((value) => {
    const length = validatorLength(value)
    return length >= 2 && length <= 40 && recordCodePattern.test(value)
  }, 'must be 2 to 40 letters, digits, hyphens or underscores, starting with a letter or digit'),
)

const projectFields = {
  code: recordCodeInput.nullish(),
  title: trimmedInput(lengthString(3, 160)),
  description: lengthString(0, 2000).nullish(),
  objectives: lengthString(0, 4000).nullish(),
  implementationArea: lengthString(0, 240).nullish(),
  implementingPartnerNames: z
    .array(lengthString(1, 120))
    .max(20)
    .refine(hasUniqueItems, 'must not repeat a partner')
    .nullish(),
  sector: lengthString(0, 160).nullish(),
  targetBeneficiaries: countInput(2_147_483_647).nullish(),
  projectBudget: pesoAmountInput.optional(),
  programManagerId: uuidString.nullish(),
  projectManagerId: uuidString.nullish(),
  monitoringOfficerId: uuidString.nullish(),
  projectOfficerIds: z
    .array(uuidString)
    .max(50)
    .refine(hasUniqueItems, 'must not repeat an officer')
    .optional(),
  startDate: strictIsoDateString.nullish(),
  endDate: strictIsoDateString.nullish(),
  status: z.enum(storedProjectStatuses),
  programId: uuidString.nullish(),
}

// Body of POST /projects.
export const createProjectRequest = z.object(projectFields).strict()
export type CreateProjectRequest = z.infer<typeof createProjectRequest>

// Body of PATCH /projects/:projectId.
export const updateProjectRequest = z
  .object({ ...projectFields, clientMutationId: uuidString, expectedUpdatedAt: isoDateString })
  .strict()
export type UpdateProjectRequest = z.infer<typeof updateProjectRequest>
