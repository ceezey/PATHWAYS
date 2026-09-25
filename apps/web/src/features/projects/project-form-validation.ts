import { normalizeTargetGoal, targetGoalSchema } from '@pathways/shared'
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

export const projectSetupSchema = z
  .object({
    objectives: z.string().trim().min(3, 'Enter project objectives.'),
    partners: z.string().trim().max(1000, 'Use at most 1,000 characters.'),
    projectBudget: z.union([
      z.literal(''),
      z.string().regex(moneyPattern, 'Enter a valid PHP amount.'),
    ]),
    targetBeneficiaries: z.union([z.literal(''), targetBeneficiariesSchema]),
    targetGoal: z.union([z.literal(''), targetGoalSchema]),
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
  .refine((value) => new Date(value.endDate) >= new Date(value.startDate), {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  })

export type ProjectSetupSchema = z.infer<typeof projectSetupSchema>

const projectCoreInput = (values: ProjectSetupSchema) => ({
  title: values.title,
  description: values.description,
  objectives: values.objectives,
  implementationArea: values.area,
  implementingPartners: values.partners || undefined,
  projectBudget: values.projectBudget || undefined,
  targetBeneficiaries:
    values.targetBeneficiaries === '' ? undefined : Number(values.targetBeneficiaries),
  sector: values.sector || undefined,
  startDate: values.startDate,
  endDate: values.endDate,
  status: values.status,
})

const selectedUserId = (users: UserRecord[], name: string, role: UserRecord['role']) =>
  users.find((user) => user.name === name && user.role === role && user.accountStatus === 'Active')
    ?.id

export const toProjectTeamInput = (
  values: ProjectSetupSchema,
  users: UserRecord[],
): Partial<CreateProjectInput> => {
  const programManagerId = selectedUserId(users, values.programManager, 'Program Manager')
  const projectManagerId = selectedUserId(users, values.projectManager, 'Project Manager')
  const monitoringOfficerId = selectedUserId(
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
    ...(programManagerId ? { programManagerId } : {}),
    ...(projectManagerId ? { projectManagerId } : {}),
    ...(monitoringOfficerId ? { monitoringOfficerId } : {}),
    ...(hasOfficerOptions && projectOfficerIds.length === selectedOfficerNames.length
      ? { projectOfficerIds }
      : {}),
  }
}

export const toCreateProjectInput = (values: ProjectSetupSchema): CreateProjectInput => ({
  ...projectCoreInput(values),
  targetGoal: normalizeTargetGoal(values.targetGoal),
})

export const toUpdateProjectInput = (
  values: ProjectSetupSchema,
  current: ProjectDetail,
): UpdateProjectInput => ({
  ...projectCoreInput(values),
  ...(values.targetGoal === '' ? {} : { targetGoal: normalizeTargetGoal(values.targetGoal) }),
  code: current.code,
  programId: current.programId ?? undefined,
  status:
    current.storedStatus === 'CANCELLED' && values.status === 'Needs Attention'
      ? 'CANCELLED'
      : values.status,
  expectedUpdatedAt: current.updatedAt ?? '',
})
