import { z } from 'zod'
import { isCalendarDate } from './metric-math'

export const ROLE_OVERVIEW_CONTRACT_VERSION = 'dashboard.role-overview.v1' as const
export const alertSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
export type AlertSeverity = (typeof alertSeverities)[number]

const id = z.string().uuid()
const count = z.number().int().min(0)
const day = z.string().refine(isCalendarDate)
const instant = z.string().datetime()
const text = (max: number) => z.string().max(max)
const percent = z.number().int().min(0).max(100)
const reviewStatus = z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED'])
const list = <T extends z.ZodTypeAny>(row: T) =>
  z.object({ count, rows: z.array(row).max(5) }).strict()

const projectRow = z
  .object({
    id,
    code: text(64),
    title: text(200),
    status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED']),
    programName: text(200).nullable(),
    managerName: text(200).nullable(),
  })
  .strict()

const activityRow = z
  .object({
    id,
    projectId: id,
    projectTitle: text(200),
    code: text(64),
    title: text(200),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FOR_REVIEW', 'COMPLETED', 'CANCELLED']),
    overdue: z.boolean(),
    plannedEndDate: day.nullable(),
    progress: percent,
  })
  .strict()

const flaggedRow = z
  .object({
    updateId: id,
    activityId: id,
    projectId: id,
    activityCode: text(64),
    activityTitle: text(200),
    reviewReason: text(1000),
    reviewedAt: instant,
  })
  .strict()

const submissionRow = z
  .object({
    kind: z.enum(['EXPENSE', 'UPDATE']),
    id,
    projectId: id,
    activityId: id.nullable(),
    label: text(300),
    amount: text(32).nullable(),
    progress: percent.nullable(),
    status: reviewStatus,
    submittedAt: instant,
  })
  .strict()

const proofRow = z
  .object({
    updateId: id,
    activityId: id,
    projectId: id,
    projectTitle: text(200),
    activityCode: text(64),
    activityTitle: text(200),
    submitterName: text(200),
    submittedAt: instant,
    progress: percent,
  })
  .strict()

const approvalRow = z
  .object({
    expenseId: id,
    activityId: id.nullable(),
    projectId: id,
    projectTitle: text(200),
    description: text(300),
    amount: text(32),
    verifiedByName: text(200).nullable(),
    verifiedAt: instant.nullable(),
  })
  .strict()

const alertRow = z
  .object({
    id,
    projectId: id,
    title: text(300),
    severity: z.enum(alertSeverities),
    explanation: text(1000),
    recommendation: text(1000).nullable(),
    budget: z.boolean(),
  })
  .strict()

/** Role dashboard sections; a `null` section means the viewer lacks its permission. */
export const roleOverviewSchema = z
  .object({
    contractVersion: z.literal(ROLE_OVERVIEW_CONTRACT_VERSION),
    businessDate: day,
    projects: z.array(projectRow).max(20),
    myActivities: list(activityRow).nullable(),
    flaggedProof: list(flaggedRow).nullable(),
    recentSubmissions: list(submissionRow).nullable(),
    submittedThisMonth: z.object({ updates: count, expenses: count }).strict().nullable(),
    proofQueue: list(proofRow).nullable(),
    approvalQueue: list(approvalRow).nullable(),
    datasetsImportedThisMonth: count.nullable(),
    alerts: z
      .object({
        open: count,
        capped: z.boolean(),
        bySeverity: z.object({ CRITICAL: count, HIGH: count, MEDIUM: count, LOW: count }).strict(),
        byProject: z
          .array(
            z.object({ projectId: id, open: count, maxSeverity: z.enum(alertSeverities) }).strict(),
          )
          .max(100),
        recent: z.array(alertRow).max(5),
      })
      .strict()
      .nullable(),
  })
  .strict()

export type RoleOverview = z.infer<typeof roleOverviewSchema>
