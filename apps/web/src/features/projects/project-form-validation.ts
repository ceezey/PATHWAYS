import { z } from 'zod'

import type {
  CreateProjectInput,
  ProjectDetail,
  UpdateProjectInput,
  UserRecord,
} from '@/types/pathways'

const moneyPattern = /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/
const wholeNumberPattern = /^(0|[1-9][0-9]{0,9})$/
const targetBeneficiariesSchema = z
  .string()
  .regex(wholeNumberPattern, 'Enter a valid whole-number target.')
  .refine((value) => Number(value) <= 2_147_483_647, 'Enter a smaller target.')

const projectSetupBaseSchema = z.object({
  partners: z.string().trim().max(1000, 'Use at most 1,000 characters.'),
  partnerOrganizations: z
    .string()
    .trim()
    .max(2500)
    .refine((value) => {
      const names = value
        .split('\n')
        .map((name) => name.trim())
        .filter(Boolean)
      return names.length <= 20 && names.every((name) => name.length <= 120)
    }, 'Use at most 20 organizations, one per line, with names of at most 120 characters.')
    .optional(),
  projectBudget: z.union([
    z.literal(''),
    z.string().regex(moneyPattern, 'Enter a valid PHP amount.'),
  ]),
  targetBeneficiaries: z.union([z.literal(''), targetBeneficiariesSchema]),

  title: z.string().trim().min(3, 'Enter a project title.'),
  sector: z.string().trim().max(160, 'Use at most 160 characters.'),
  area: z.string().trim().min(2, 'Enter the implementation area.'),
  startDate: z.string().min(1, 'Choose a start date.'),
  endDate: z.string().min(1, 'Choose an end date.'),
  status: z.enum(['Active', 'Needs Attention', 'Planned', 'Completed']),
  description: z.string().trim().min(10, 'Enter a short project description.'),
  programManager: z.string(),
  projectManager: z.string(),
  monitoringOfficer: z.string(),
  projectOfficers: z.string(),
})

export const projectSetupSchema = projectSetupBaseSchema.refine(
  (value) => new Date(value.endDate) >= new Date(value.startDate),
  {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  },
)

export type ProjectSetupSchema = z.infer<typeof projectSetupBaseSchema>

// The team editor dialog only exposes team-assignment fields; the remaining
// project fields are carried through unchanged from the loaded project, so
// dates/sector/area must not be required here (a project can legitimately
// have none recorded yet).
export const projectTeamEditSchema = projectSetupBaseSchema
  .extend({
    sector: z.string().trim().max(160, 'Use at most 160 characters.'),
    area: z.string().trim(),
    startDate: z.string(),
    endDate: z.string(),
  })
  .refine(
    (value) =>
      !value.startDate || !value.endDate || new Date(value.endDate) >= new Date(value.startDate),
    {
      message: 'End date must be on or after the start date.',
      path: ['endDate'],
    },
  )

const projectCoreInput = (values: ProjectSetupSchema) => ({
  title: values.title,
  description: values.description,
  implementationArea: values.area,
  implementingPartners: values.partners || undefined,
  implementingPartnerNames: [
    ...new Set(
      (values.partnerOrganizations ?? '')
        .split('\n')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ],
  projectBudget: values.projectBudget || undefined,
  targetBeneficiaries:
    values.targetBeneficiaries === '' ? undefined : Number(values.targetBeneficiaries),
  sector: values.sector || undefined,
  startDate: values.startDate || undefined,
  endDate: values.endDate || undefined,
  status: values.status,
})

const selectedUserId = (users: UserRecord[], name: string, role: UserRecord['role']) =>
  users.find((user) => user.name === name && user.role === role && user.accountStatus === 'Active')
    ?.id

// Resolves a single-assignment team field to the id to send: `null` clears
// the assignment explicitly (the field was left/set blank, i.e. "None"),
// a string sets it, and `undefined` means the selection could not be
// resolved and should be left out of the payload rather than risk clearing
// or corrupting an assignment (validateProjectTeamSelections rejects any
// non-blank, non-eligible name before submission, so this path is only hit
// defensively).
const resolvedRoleId = (users: UserRecord[], name: string, role: UserRecord['role']) => {
  if (name === '') return null
  return selectedUserId(users, name, role) ?? undefined
}

export const toProjectTeamInput = (
  values: ProjectSetupSchema,
  users: UserRecord[],
): Partial<CreateProjectInput> => {
  const programManagerId = resolvedRoleId(users, values.programManager, 'Program Manager')
  const projectManagerId = resolvedRoleId(users, values.projectManager, 'Project Manager')
  const monitoringOfficerId = resolvedRoleId(
    users,
    values.monitoringOfficer,
    'Monitoring and Evaluation Officer',
  )
  const selectedOfficerNames = values.projectOfficers
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const projectOfficerIds = selectedOfficerNames
    .map((name) => selectedUserId(users, name, 'Project Officer'))
    .filter((id): id is string => Boolean(id))
  const hasOfficerOptions = users.some(
    (user) => user.role === 'Project Officer' && user.accountStatus === 'Active',
  )

  return {
    ...(programManagerId !== undefined ? { programManagerId } : {}),
    ...(projectManagerId !== undefined ? { projectManagerId } : {}),
    ...(monitoringOfficerId !== undefined ? { monitoringOfficerId } : {}),
    ...(hasOfficerOptions && projectOfficerIds.length === selectedOfficerNames.length
      ? { projectOfficerIds }
      : {}),
  }
}

export const toCreateProjectInput = (values: ProjectSetupSchema): CreateProjectInput => ({
  ...projectCoreInput(values),
})

export const toUpdateProjectInput = (
  values: ProjectSetupSchema,
  current: ProjectDetail,
): UpdateProjectInput => ({
  ...projectCoreInput(values),

  code: current.code,
  programId: current.programId ?? undefined,
  status:
    current.storedStatus === 'CANCELLED' && values.status === 'Needs Attention'
      ? 'CANCELLED'
      : values.status,
  expectedUpdatedAt: current.updatedAt ?? '',
})
