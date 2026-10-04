# Role Dashboards (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Project Officer, M&E Officer, Project Manager, Program Manager and Grant Manager home dashboards with the Figma role layouts, fed by one new read-only, project-scoped API endpoint and existing per-project endpoints.

**Architecture:** A new isolated `RoleOverviewService` in the dashboards module returns one versioned payload of permission-gated sections (a section is `null` when the viewer lacks its permission), built with Prisma inside `withAuthorizedOperation` and `projectScope(actor)` like `ActionCountsService`. The web renders one composition per role from shared primitives; row actions open the existing activity review sheet or navigate to existing screens. System Administrator keeps the current dashboard. Plan 2 (separate) adds the Request extension and escalated-alerts workflows with migrations.

**Tech Stack:** NestJS 11, Prisma 6, zod (packages/shared), Next.js 15 App Router, React, Tailwind with DSD tokens, Vitest, Biome.

**Spec:** Figma role frames shared in the 2026-10-04 session (Project Officer, M&E Officer, Project Manager, Program Manager; Grant Manager = Program Manager read-only) plus the user decisions recorded in `docs/activity-log.md` (2026-10-04): health labels derive from open alerts, row actions open existing screens, System Administrator unchanged, sidebar unchanged.

## Global Constraints

- No migrations, no new tables, no `prisma migrate dev` (Plan 1). Never `@Public`; keep the global `APP_GUARD`.
- Every query filters `organizationId: actor.organizationId` and `project: projectScope(actor)` (or `projectId` within the scoped id list).
- A section is computed only when the viewer holds its permission; otherwise it is `null` in the payload.
- Health label rule (no success rating, DSD section 1043/1047): `CRITICAL` open alert -> Critical; `HIGH` or `MEDIUM` open alert -> At risk; no open alert -> On track; project status `PLANNED` -> Planned. Copy must say these come from open rule-based alerts.
- Evaluation score is shown as the stored number with no Good/Needs improvement label.
- Grant Manager renders the portfolio layout with no action buttons.
- Lists are capped (5 rows per list, 20 projects); counts that page through alerts report `capped`.
- UI uses DSD tokens only: `bg-card`, `border-border`, semantic `danger|warning|info|success` tones, radius `rounded-xl` cards, 44px targets, sentence-case labels, no emojis.
- Comments: one sentence. Biome formatting (`pnpm exec biome check --write <paths>`).
- Gates per task: the task's tests; at the end `pnpm --filter api build`, `pnpm --filter web build`, `pnpm --filter web exec tsc --noEmit`.

## Review Focus

- A Project Officer assigned to one project must never see another project's activity, proof or submission rows; pin with a scope assertion on every Prisma `where` (Task 2).
- A viewer without `evidence.review`/`expenses.approve`/`imports.read`/`alerts.read` must get `null` for that section and the UI must hide the card, not show zero (Tasks 2, 3, 7-10).
- A project with alerts beyond the page cap must still label correctly and show `N+` (Task 3).
- An activity with no planned end date must not crash or be marked overdue (Task 2).
- A user whose `fullName` is a single word or empty must still get a greeting (Task 6).

---

### Task 1: Shared role-overview contract

**Files:**
- Create: `packages/shared/src/monitoring/role-overview.ts`
- Modify: `packages/shared/src/index.ts` (add export after `./monitoring/action-counts`)
- Test: `packages/shared/src/monitoring/role-overview.test.ts`

**Interfaces:**
- Produces: `ROLE_OVERVIEW_CONTRACT_VERSION`, `roleOverviewSchema`, `type RoleOverview`, `alertSeverities`, `type AlertSeverity`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ROLE_OVERVIEW_CONTRACT_VERSION, roleOverviewSchema } from './role-overview'

const base = {
  contractVersion: ROLE_OVERVIEW_CONTRACT_VERSION,
  businessDate: '2026-10-04',
  projects: [],
  myActivities: null,
  flaggedProof: null,
  recentSubmissions: null,
  submittedThisMonth: null,
  proofQueue: null,
  approvalQueue: null,
  datasetsImportedThisMonth: null,
  alerts: null,
}

describe('roleOverviewSchema', () => {
  it('accepts an all-null payload for a viewer without section permissions', () => {
    expect(roleOverviewSchema.parse(base)).toEqual(base)
  })
  it('rejects unknown keys so the payload cannot leak extra fields', () => {
    expect(() => roleOverviewSchema.parse({ ...base, email: 'x' })).toThrow()
  })
  it('caps list sections at 5 rows', () => {
    const row = {
      updateId: '10000000-0000-4000-8000-000000000001',
      activityId: '10000000-0000-4000-8000-000000000002',
      projectId: '10000000-0000-4000-8000-000000000003',
      projectTitle: 'P',
      activityCode: 'ACT-1',
      activityTitle: 'A',
      submitterName: 'S',
      submittedAt: '2026-10-04T00:00:00.000Z',
      progress: 50,
    }
    expect(() =>
      roleOverviewSchema.parse({ ...base, proofQueue: { count: 6, rows: Array(6).fill(row) } }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pathways/shared exec vitest run src/monitoring/role-overview.test.ts`
Expected: FAIL, cannot resolve `./role-overview`.

- [ ] **Step 3: Write the contract**

```ts
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
          .array(z.object({ projectId: id, open: count, maxSeverity: z.enum(alertSeverities) }).strict())
          .max(100),
        recent: z.array(alertRow).max(5),
      })
      .strict()
      .nullable(),
  })
  .strict()

export type RoleOverview = z.infer<typeof roleOverviewSchema>
```

Add to `packages/shared/src/index.ts` directly after `export * from './monitoring/action-counts'`:

```ts
export * from './monitoring/role-overview'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pathways/shared exec vitest run src/monitoring/role-overview.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/monitoring/role-overview.ts packages/shared/src/monitoring/role-overview.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): role overview dashboard contract"
```

---

### Task 2: RoleOverviewService (projects, activities, proof, submissions, queues, imports)

**Files:**
- Create: `apps/api/src/modules/dashboards/role-overview.service.ts`
- Test: `apps/api/src/modules/dashboards/role-overview.service.test.ts`

**Interfaces:**
- Consumes: `projectScope(actor)` (`apps/api/src/modules/auth/authorized-data.service.ts:12`), `withAuthorizedOperation(prisma, identity, 'projects.read', fn)`, `hasAtomicPermission(role, permissions, p)`, `RulesHumanService` (Task 3 uses it), `roleOverviewSchema` (Task 1).
- Produces: `class RoleOverviewService { read(identity: ApplicationIdentity): Promise<RoleOverview> }`; Task 3 adds the private `alerts(actor)` method into this same class.

Permission gates (exact): `myActivities` -> `activities.read`; `flaggedProof`, `recentSubmissions`, `submittedThisMonth` -> `activities.proof.submit`; `proofQueue` -> `evidence.review`; `approvalQueue` -> `expenses.approve`; `datasetsImportedThisMonth` -> `imports.read`; `projects[].managerName`/`programName` -> `projects.detail.read` (else `null`).

- [ ] **Step 1: Write the failing tests**

Use the harness style of `apps/api/src/modules/dashboards/action-counts.service.test.ts` (mock `@pathways/config` and `withAuthorizedOperation`, `actor(role)` from `rolePermissions`). Tx mock:

```ts
const tx = {
  project: { findMany: vi.fn().mockResolvedValue([{ id: project, code: 'P-1', title: 'Project', status: 'ONGOING', program: { name: 'Prog' }, userProjectAssignment_project: [{ user: { fullName: 'Pat Manager' } }] }]) },
  projectActivity: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  activityUpdate: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  budgetExpenseEntry: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  dataImportBatch: { count: vi.fn().mockResolvedValue(2) },
}
```

Tests:

```ts
it('scopes every query to the organization and the actor project scope', async () => {
  const { tx, service } = setup()
  await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
  for (const fn of [tx.activityUpdate.findMany, tx.activityUpdate.count, tx.dataImportBatch.count]) {
    for (const [arg] of fn.mock.calls) {
      expect(arg.where.organizationId).toBe(org)
      expect(arg.where.project).toMatchObject({ organizationId: org, id: { in: [project] } })
    }
  }
})

it('returns null sections for permissions the viewer lacks', async () => {
  const { service } = setup()
  const result = await service.read(actor('GRANT_MANAGER'))
  expect(result.proofQueue).toBeNull()
  expect(result.approvalQueue).toBeNull()
  expect(result.flaggedProof).toBeNull()
  expect(roleOverviewSchema.parse(result)).toEqual(result)
})

it('limits officer activities to active assignments of the viewer', async () => {
  const { tx, service } = setup()
  await service.read(actor('PROJECT_OFFICER'))
  const where = tx.projectActivity.findMany.mock.calls[0][0].where
  expect(where.projectActivityAssignment_activity).toEqual({
    some: { status: 'ACTIVE', projectAssignment: { userId: user, status: 'ACTIVE' } },
  })
})

it('does not mark an activity without a planned end date as overdue', async () => {
  const { tx, service } = setup()
  tx.projectActivity.findMany.mockResolvedValue([
    { id: project, projectId: project, code: 'A', title: 'T', status: 'IN_PROGRESS', plannedEndDate: null, progressPercent: 10, project: { title: 'P' } },
  ])
  tx.projectActivity.count.mockResolvedValue(1)
  const result = await service.read(actor('PROJECT_OFFICER'))
  expect(result.myActivities?.rows[0].overdue).toBe(false)
})

it('excludes own submissions from the review queues', async () => {
  const { tx, service } = setup()
  await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
  expect(tx.activityUpdate.findMany.mock.calls.at(-1)[0].where.submittedById).toEqual({ not: user })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec vitest run src/modules/dashboards/role-overview.service.test.ts`
Expected: FAIL, cannot resolve `./role-overview.service`. (If Prisma client is missing in a fresh worktree, run `pnpm --filter api build` once first.)

- [ ] **Step 3: Implement the service**

```ts
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  ROLE_OVERVIEW_CONTRACT_VERSION,
  type RoleOverview,
  businessCalendarDate,
  roleOverviewSchema,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { type AtomicPermission, hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { RulesHumanService } from '../rules/rules-human.service'

type Tx = Prisma.TransactionClient
const rows = 5
const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

/** Role dashboard sections; each runs only when the viewer holds its permission. */
@Injectable()
export class RoleOverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RulesHumanService) private readonly rules: RulesHumanService,
  ) {}

  private businessDate() {
    try {
      return businessCalendarDate(new Date(), readApiEnv(process.env).BUSINESS_TIME_ZONE)
    } catch {
      throw new ServiceUnavailableException('The configured business time zone is invalid.')
    }
  }

  private async projects(tx: Tx, actor: ApplicationIdentity, detail: boolean) {
    const found = await tx.project.findMany({
      where: projectScope(actor),
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        program: { select: { name: true } },
        userProjectAssignment_project: {
          where: { status: 'ACTIVE', user: { userRoles: { some: { role: { code: 'PROJECT_MANAGER' } } } } },
          select: { user: { select: { fullName: true } } },
          take: 1,
        },
      },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: 20,
    })
    return found.map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      status: p.status,
      programName: detail ? (p.program?.name ?? null) : null,
      managerName: detail ? (p.userProjectAssignment_project[0]?.user.fullName ?? null) : null,
    }))
  }

  private async myActivities(tx: Tx, actor: ApplicationIdentity, today: Date) {
    const where = {
      organizationId: actor.organizationId,
      archivedAt: null,
      project: projectScope(actor),
      status: { not: 'CANCELLED' as const },
      projectActivityAssignment_activity: {
        some: { status: 'ACTIVE' as const, projectAssignment: { userId: actor.userId, status: 'ACTIVE' as const } },
      },
    }
    const [count, found] = await Promise.all([
      tx.projectActivity.count({ where }),
      tx.projectActivity.findMany({
        where,
        select: { id: true, projectId: true, code: true, title: true, status: true, plannedEndDate: true, progressPercent: true, project: { select: { title: true } } },
        orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
        take: rows,
      }),
    ])
    return {
      count,
      rows: found.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        projectTitle: a.project.title,
        code: a.code,
        title: a.title,
        status: a.status,
        // Same overdue rule as action counts: planned end before today and not closed.
        overdue: Boolean(a.plannedEndDate && a.plannedEndDate < today && a.status !== 'COMPLETED'),
        plannedEndDate: day(a.plannedEndDate),
        progress: a.progressPercent,
      })),
    }
  }

  private async flaggedProof(tx: Tx, actor: ApplicationIdentity) {
    const where = {
      organizationId: actor.organizationId,
      project: projectScope(actor),
      submittedById: actor.userId,
      status: 'REJECTED' as const,
      activity: { status: { notIn: ['COMPLETED', 'CANCELLED'] as Array<'COMPLETED' | 'CANCELLED'> } },
    }
    const [count, found] = await Promise.all([
      tx.activityUpdate.count({ where }),
      tx.activityUpdate.findMany({
        where,
        select: { id: true, activityId: true, projectId: true, reviewReason: true, reviewedAt: true, activity: { select: { code: true, title: true } } },
        orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
        take: rows,
      }),
    ])
    return {
      count,
      rows: found.map((u) => ({
        updateId: u.id,
        activityId: u.activityId,
        projectId: u.projectId,
        activityCode: u.activity.code,
        activityTitle: u.activity.title,
        reviewReason: u.reviewReason ?? '',
        reviewedAt: (u.reviewedAt ?? new Date(0)).toISOString(),
      })),
    }
  }

  private async submissions(tx: Tx, actor: ApplicationIdentity, monthStart: Date) {
    const own = { organizationId: actor.organizationId, project: projectScope(actor), submittedById: actor.userId }
    const [updates, expenses, updateCount, expenseCount] = await Promise.all([
      tx.activityUpdate.findMany({
        where: own,
        select: { id: true, projectId: true, activityId: true, progressPercent: true, status: true, submittedAt: true, activity: { select: { title: true } } },
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        take: rows,
      }),
      tx.budgetExpenseEntry.findMany({
        where: own,
        select: { id: true, projectId: true, description: true, amount: true, status: true, submittedAt: true, budgetRecord: { select: { activityId: true } } },
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        take: rows,
      }),
      tx.activityUpdate.count({ where: { ...own, submittedAt: { gte: monthStart } } }),
      tx.budgetExpenseEntry.count({ where: { ...own, submittedAt: { gte: monthStart } } }),
    ])
    const merged = [
      ...updates.map((u) => ({ kind: 'UPDATE' as const, id: u.id, projectId: u.projectId, activityId: u.activityId, label: u.activity.title, amount: null, progress: u.progressPercent, status: u.status, submittedAt: u.submittedAt.toISOString() })),
      ...expenses.map((e) => ({ kind: 'EXPENSE' as const, id: e.id, projectId: e.projectId, activityId: e.budgetRecord.activityId ?? null, label: e.description, amount: e.amount.toFixed(2), progress: null, status: e.status, submittedAt: e.submittedAt.toISOString() })),
    ]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, rows)
    return {
      recent: { count: merged.length, rows: merged },
      month: { updates: updateCount, expenses: expenseCount },
    }
  }

  private async proofQueue(tx: Tx, actor: ApplicationIdentity) {
    // Matches the review queue and refuses self-review like the review endpoint.
    const where = {
      organizationId: actor.organizationId,
      project: projectScope(actor),
      status: 'PENDING' as const,
      submittedById: { not: actor.userId },
      evidenceMedia_update: { some: {}, none: { storageReady: false } },
    }
    const [count, found] = await Promise.all([
      tx.activityUpdate.count({ where }),
      tx.activityUpdate.findMany({
        where,
        select: { id: true, activityId: true, projectId: true, progressPercent: true, submittedAt: true, project: { select: { title: true } }, activity: { select: { code: true, title: true } }, submittedBy: { select: { fullName: true } } },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take: rows,
      }),
    ])
    return {
      count,
      rows: found.map((u) => ({
        updateId: u.id,
        activityId: u.activityId,
        projectId: u.projectId,
        projectTitle: u.project.title,
        activityCode: u.activity.code,
        activityTitle: u.activity.title,
        submitterName: u.submittedBy.fullName,
        submittedAt: u.submittedAt.toISOString(),
        progress: u.progressPercent,
      })),
    }
  }

  private async approvalQueue(tx: Tx, actor: ApplicationIdentity) {
    const where = {
      organizationId: actor.organizationId,
      project: projectScope(actor),
      status: 'VERIFIED' as const,
      submittedById: { not: actor.userId },
      NOT: { verifiedById: actor.userId },
    }
    const [count, found] = await Promise.all([
      tx.budgetExpenseEntry.count({ where }),
      tx.budgetExpenseEntry.findMany({
        where,
        select: { id: true, projectId: true, description: true, amount: true, verifiedAt: true, project: { select: { title: true } }, verifiedBy: { select: { fullName: true } }, budgetRecord: { select: { activityId: true } } },
        orderBy: [{ verifiedAt: 'asc' }, { id: 'asc' }],
        take: rows,
      }),
    ])
    return {
      count,
      rows: found.map((e) => ({
        expenseId: e.id,
        activityId: e.budgetRecord.activityId ?? null,
        projectId: e.projectId,
        projectTitle: e.project.title,
        description: e.description,
        amount: e.amount.toFixed(2),
        verifiedByName: e.verifiedBy?.fullName ?? null,
        verifiedAt: e.verifiedAt?.toISOString() ?? null,
      })),
    }
  }

  async read(identity: ApplicationIdentity): Promise<RoleOverview> {
    const businessDate = this.businessDate()
    const today = new Date(`${businessDate}T00:00:00.000Z`)
    const monthStart = new Date(`${businessDate.slice(0, 8)}01T00:00:00.000Z`)
    const db = await withAuthorizedOperation(this.prisma, identity, 'projects.read', async (tx, actor) => {
      const can = (p: AtomicPermission) => hasAtomicPermission(actor.roles[0], actor.permissions, p)
      const submitter = can('activities.proof.submit')
      const own = submitter ? await this.submissions(tx, actor, monthStart) : null
      return {
        actor,
        projects: await this.projects(tx, actor, can('projects.detail.read')),
        myActivities: can('activities.read') ? await this.myActivities(tx, actor, today) : null,
        flaggedProof: submitter ? await this.flaggedProof(tx, actor) : null,
        recentSubmissions: own?.recent ?? null,
        submittedThisMonth: own?.month ?? null,
        proofQueue: can('evidence.review') ? await this.proofQueue(tx, actor) : null,
        approvalQueue: can('expenses.approve') ? await this.approvalQueue(tx, actor) : null,
        datasetsImportedThisMonth: can('imports.read')
          ? await tx.dataImportBatch.count({
              where: {
                organizationId: actor.organizationId,
                project: projectScope(actor),
                status: { in: ['PROCESSED', 'PARTIALLY_PROCESSED'] },
                processedAt: { gte: monthStart },
              },
            })
          : null,
      }
    })
    const { actor, ...sections } = db
    return roleOverviewSchema.parse({
      contractVersion: ROLE_OVERVIEW_CONTRACT_VERSION,
      businessDate,
      ...sections,
      alerts: null,
    })
  }
}
```

Implementation notes for the engineer (verify against `apps/api/prisma/schema.prisma` before running; fix names, not logic):
- `ProjectBudgetRecord.activityId` is the expense-to-activity link (`projectBudgetRecord_activity` relation on `ProjectActivity`); if the field is named differently, use the actual scalar.
- The project-manager lookup must use the real role relation on `SystemUser`; if no role relation exists, fall back to `actor`-independent `managerName: null` and leave a one-line comment. Do not guess a table.
- `monthStart` uses the business-date month in UTC midnight, same convention as `overdueActivities` in `action-counts.service.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api exec vitest run src/modules/dashboards/role-overview.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/dashboards/role-overview.service.ts apps/api/src/modules/dashboards/role-overview.service.test.ts
git commit -m "feat(dashboards): role overview service for activity, proof, submission and queue sections"
```

---

### Task 3: Alert summary section and endpoint

**Files:**
- Modify: `apps/api/src/modules/dashboards/role-overview.service.ts` (add `alerts()` and use it in `read`)
- Create: `apps/api/src/modules/dashboards/role-overview.controller.ts`
- Modify: `apps/api/src/modules/dashboards/dashboards.module.ts` (register controller and service)
- Test: extend `apps/api/src/modules/dashboards/role-overview.service.test.ts`; create `apps/api/src/modules/dashboards/role-overview.controller.test.ts`

**Interfaces:**
- Consumes: `RulesHumanService.listAlerts(identity, { status, limit, cursor })` returning `{ items: Alert[], nextCursor: string | null }` where an item carries `id`, `projectId`, `title`, `severity`, `lifecycle`, `explanation`, `evidence[].metric`, `predefinedRecommendations[]` (`apps/api/src/modules/rules/rules-human-contract.ts:153-174`).
- Produces: `GET /dashboards/role-overview` (`@RequirePermission('projects.read')`, `Cache-Control: private, no-store`) returning `RoleOverview`.

- [ ] **Step 1: Write the failing tests**

```ts
it('summarizes open alerts by severity and project, budget flagged by metric', async () => {
  const { rules, service } = setup()
  rules.listAlerts.mockImplementation(async (_i, q) =>
    q.status === 'NEW'
      ? { items: [
          { id: a1, projectId: project, title: 'Budget depletion', severity: 'CRITICAL', lifecycle: 'NEW', explanation: 'x', evidence: [{ metric: 'BUDGET_UTILIZATION_PERCENT' }], predefinedRecommendations: [{ title: 'Reallocate' }] },
          { id: a2, projectId: project, title: 'Low KPI', severity: 'HIGH', lifecycle: 'NEW', explanation: 'y', evidence: [{ metric: 'INDICATOR_PROGRESS_PERCENT' }], predefinedRecommendations: [] },
        ], nextCursor: null }
      : { items: [], nextCursor: null },
  )
  const result = await service.read(actor('PROJECT_MANAGER'))
  expect(result.alerts?.open).toBe(2)
  expect(result.alerts?.bySeverity).toEqual({ CRITICAL: 1, HIGH: 1, MEDIUM: 0, LOW: 0 })
  expect(result.alerts?.byProject).toEqual([{ projectId: project, open: 2, maxSeverity: 'CRITICAL' }])
  expect(result.alerts?.recent[0]).toMatchObject({ severity: 'CRITICAL', budget: true, recommendation: 'Reallocate' })
})

it('reports capped when alert paging hits the page limit', async () => {
  const { rules, service } = setup()
  rules.listAlerts.mockResolvedValue({ items: [], nextCursor: 'more' })
  const result = await service.read(actor('PROJECT_MANAGER'))
  expect(result.alerts?.capped).toBe(true)
})

it('returns null alerts without alerts.read', async () => {
  const { rules, service } = setup()
  const viewer = { ...actor('PROJECT_MANAGER'), permissions: actor('PROJECT_MANAGER').permissions.filter((p) => p !== 'alerts.read') }
  expect((await service.read(viewer)).alerts).toBeNull()
  expect(rules.listAlerts).not.toHaveBeenCalled()
})
```

Controller test (mirror `action-counts` controller test pattern in `action-counts.service.test.ts`):

```ts
it('requires projects.read and forwards the profile', async () => {
  expect(Reflect.getMetadata(PERMISSION_KEY, RoleOverviewController.prototype.read)).toEqual(['projects.read'])
  const service = { read: vi.fn().mockResolvedValue({}) }
  const controller = new RoleOverviewController(service as unknown as RoleOverviewService)
  await controller.read({ user: actor('PROJECT_OFFICER') } as never)
  expect(service.read).toHaveBeenCalledWith(actor('PROJECT_OFFICER'))
  expect(() => controller.read({} as never)).toThrow('Application profile is required.')
})
```

(Check the exact metadata shape used by `RequirePermission` in `action-counts.service.test.ts` and match it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec vitest run src/modules/dashboards/role-overview`
Expected: FAIL (alerts null; controller missing).

- [ ] **Step 3: Implement**

Add to the service class:

```ts
  private async alerts(actor: ApplicationIdentity) {
    const counted: Array<{ id: string; projectId: string; title: string; severity: AlertSeverity; explanation: string; evidence: Array<{ metric: string }>; predefinedRecommendations: Array<{ title: string }> }> = []
    let capped = false
    for (const status of ['NEW', 'REVIEWED'] as const) {
      let cursor: string | undefined
      for (let page = 0; ; page += 1) {
        if (page === 10) {
          capped = true
          break
        }
        const result = await this.rules.listAlerts(actor, { status, limit: '100', ...(cursor ? { cursor } : {}) })
        counted.push(...(result.items as typeof counted))
        if (!result.nextCursor) break
        cursor = result.nextCursor
      }
    }
    const rank = (s: AlertSeverity) => alertSeverities.indexOf(s)
    const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    const projects = new Map<string, { open: number; maxSeverity: AlertSeverity }>()
    for (const a of counted) {
      bySeverity[a.severity] += 1
      const p = projects.get(a.projectId)
      projects.set(a.projectId, {
        open: (p?.open ?? 0) + 1,
        maxSeverity: p && rank(p.maxSeverity) <= rank(a.severity) ? p.maxSeverity : a.severity,
      })
    }
    const recent = [...counted]
      .sort((x, y) => rank(x.severity) - rank(y.severity) || x.id.localeCompare(y.id))
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        projectId: a.projectId,
        title: a.title.slice(0, 300),
        severity: a.severity,
        explanation: a.explanation.slice(0, 1000),
        recommendation: a.predefinedRecommendations[0]?.title.slice(0, 1000) ?? null,
        budget: a.evidence.some((e) => e.metric === 'BUDGET_UTILIZATION_PERCENT'),
      }))
    return {
      open: counted.length,
      capped,
      bySeverity,
      byProject: [...projects].map(([projectId, v]) => ({ projectId, ...v })).slice(0, 100),
      recent,
    }
  }
```

Import `alertSeverities, type AlertSeverity` from `@pathways/shared`. In `read`, after the transaction (alert routines open their own authorized operation, same as `ActionCountsService.read`):

```ts
    const canAlerts = hasAtomicPermission(actor.roles[0], actor.permissions, 'alerts.read')
    return roleOverviewSchema.parse({
      contractVersion: ROLE_OVERVIEW_CONTRACT_VERSION,
      businessDate,
      ...sections,
      alerts: canAlerts ? await this.alerts(actor) : null,
    })
```

Controller:

```ts
import { Controller, ForbiddenException, Get, Header, Inject, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { RoleOverviewService } from './role-overview.service'

@Controller('dashboards')
export class RoleOverviewController {
  constructor(@Inject(RoleOverviewService) private readonly service: RoleOverviewService) {}

  @Get('role-overview')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('projects.read')
  read(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    return this.service.read(request.user)
  }
}
```

In `dashboards.module.ts` add `RoleOverviewController` to `controllers` and `RoleOverviewService` to `providers`.

- [ ] **Step 4: Run tests and API build**

Run: `pnpm --filter api exec vitest run src/modules/dashboards` then `pnpm --filter api build`
Expected: all PASS; build exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/dashboards
git commit -m "feat(dashboards): role overview alert summary and GET /dashboards/role-overview"
```

---

### Task 4: Web client, hook and health-label helper

**Files:**
- Modify: `apps/web/src/lib/services/pathways-client.ts` (interface + `getRoleOverview` next to `getDashboardActionCounts`, line ~1105)
- Create: `apps/web/src/features/dashboard/role-overview/health.ts`
- Create: `apps/web/src/features/dashboard/role-overview/use-role-overview.ts`
- Test: `apps/web/src/features/dashboard/role-overview/health.test.ts`

**Interfaces:**
- Produces: `pathwaysClient.getRoleOverview(): Promise<RoleOverview>`; `useRoleOverview()` returning the `useAuthorizedRead` result; `healthOf(status, alert?) => { label: 'Critical'|'At risk'|'On track'|'Planned', tone: 'danger'|'warning'|'success'|'neutral' }`; `greeting(date: Date, fullName?: string|null) => string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { greeting, healthOf } from './health'

describe('healthOf', () => {
  it('labels from the highest open alert severity', () => {
    expect(healthOf('ONGOING', { open: 1, maxSeverity: 'CRITICAL' })).toEqual({ label: 'Critical', tone: 'danger' })
    expect(healthOf('ONGOING', { open: 2, maxSeverity: 'MEDIUM' })).toEqual({ label: 'At risk', tone: 'warning' })
    expect(healthOf('ONGOING', { open: 1, maxSeverity: 'LOW' })).toEqual({ label: 'On track', tone: 'success' })
    expect(healthOf('ONGOING', undefined)).toEqual({ label: 'On track', tone: 'success' })
    expect(healthOf('PLANNED', undefined)).toEqual({ label: 'Planned', tone: 'neutral' })
  })
})

describe('greeting', () => {
  it('uses the first name and the time of day', () => {
    expect(greeting(new Date('2026-10-04T01:00:00Z'), 'Ron Perez')).toBe('Good morning, Ron.')
    expect(greeting(new Date('2026-10-04T07:00:00Z'), 'Leah')).toBe('Good afternoon, Leah.')
    expect(greeting(new Date('2026-10-04T12:00:00Z'), '')).toBe('Good evening.')
  })
})
```

(Times are UTC; the helper formats hours in `Asia/Manila`, UTC+8: 09:00, 15:00, 20:00.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/health.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`health.ts`:

```ts
import type { AlertSeverity, RoleOverview } from '@pathways/shared'

type ProjectStatus = RoleOverview['projects'][number]['status']
type Health = { label: 'Critical' | 'At risk' | 'On track' | 'Planned'; tone: 'danger' | 'warning' | 'success' | 'neutral' }

/** Project health comes only from open rule-based alerts, never from a success score. */
export const healthOf = (
  status: ProjectStatus,
  alert: { open: number; maxSeverity: AlertSeverity } | undefined,
): Health => {
  if (status === 'PLANNED') return { label: 'Planned', tone: 'neutral' }
  if (alert?.maxSeverity === 'CRITICAL') return { label: 'Critical', tone: 'danger' }
  if (alert?.maxSeverity === 'HIGH' || alert?.maxSeverity === 'MEDIUM') return { label: 'At risk', tone: 'warning' }
  return { label: 'On track', tone: 'success' }
}

/** Time-of-day greeting with the first name, in the business time zone. */
export const greeting = (now: Date, fullName?: string | null) => {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }).format(now))
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const first = fullName?.trim().split(/\s+/)[0]
  return first ? `Good ${part}, ${first}.` : `Good ${part}.`
}
```

`pathways-client.ts`: add `getRoleOverview(): Promise<RoleOverview>` to the `PathwaysClient` interface and implement in the class next to `getDashboardActionCounts`:

```ts
  async getRoleOverview(): Promise<RoleOverview> {
    return roleOverviewSchema.parse(await requestFoundation('/dashboards/role-overview'))
  }
```

(import `type RoleOverview, roleOverviewSchema` from `@pathways/shared` alongside the existing action-count imports; if a demo/mock client implements `PathwaysClient`, add a method that throws the same "not configured" error the file already uses.)

`use-role-overview.ts`:

```ts
'use client'

import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'

/** Reads the role dashboard payload with the same grant gate as the action counts. */
export const useRoleOverview = () =>
  useAuthorizedRead('dashboard-role-overview', null, 'projects.read', () => pathwaysClient.getRoleOverview())
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/health.test.ts` then `pnpm --filter web exec tsc --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/pathways-client.ts apps/web/src/features/dashboard/role-overview
git commit -m "feat(dashboard): role overview client, hook and alert-based health label"
```

---

### Task 5: Shared dashboard primitives

**Files:**
- Create: `apps/web/src/features/dashboard/role-overview/primitives.tsx`
- Test: `apps/web/src/features/dashboard/role-overview/primitives.test.tsx`

**Interfaces:**
- Produces:
  - `DashboardHeading({ fullName, title, subtitle })` renders h1 greeting, h2 title (primary), subtitle muted.
  - `AccentKpi({ label, value, sub, tone, action? })` where `tone: 'danger'|'warning'|'info'|'success'` and `action?: { label: string; href?: string; onClick?: () => void }`.
  - `KpiStrip({ children })` responsive grid `sm:grid-cols-2 xl:grid-cols-4`.
  - `ListCard({ title, viewAll?: { label, href }, empty, children })`.
  - `ListRow({ lead?, title, meta, trailing?, onOpen?, href? })`.
  - `InitialsBadge({ text })` 2-letter circle (e.g. EX, UP, RP).

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccentKpi, DashboardHeading, ListCard, ListRow } from './primitives'

describe('dashboard primitives', () => {
  afterEach(cleanup)
  it('renders the greeting heading and subtitle', () => {
    render(<DashboardHeading fullName="Ron Perez" title="Your workspace" subtitle="Oct 4, 2026" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Ron\.$/)
    expect(screen.getByRole('heading', { level: 2, name: 'Your workspace' })).toBeTruthy()
  })
  it('renders a KPI with an action link', () => {
    render(<AccentKpi label="Overdue" value="1" sub="ACT-001 · 14 days" tone="danger" action={{ label: 'View', href: '/projects' }} />)
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/projects')
  })
  it('shows the empty text when a list has no rows and opens a row', () => {
    const open = vi.fn()
    const { rerender } = render(<ListCard title="Your activities" empty="Nothing assigned.">{[]}</ListCard>)
    expect(screen.getByText('Nothing assigned.')).toBeTruthy()
    rerender(<ListCard title="Your activities" empty="Nothing assigned."><ListRow title="Training" meta="P · Due Oct 9" onOpen={open} /></ListCard>)
    fireEvent.click(screen.getByRole('button', { name: /Training/ }))
    expect(open).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/primitives.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
import Link from 'next/link'
import { Children, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { greeting } from './health'

const accents = {
  danger: 'border-l-danger text-danger',
  warning: 'border-l-warning text-warning',
  info: 'border-l-primary text-primary',
  success: 'border-l-success text-success',
} as const

export const DashboardHeading = ({ fullName, title, subtitle }: { fullName?: string | null; title: string; subtitle: string }) => (
  <header className="space-y-1">
    <h1 className="font-heading text-3xl text-foreground">{greeting(new Date(), fullName)}</h1>
    <h2 className="pt-2 text-lg font-semibold text-primary">{title}</h2>
    <p className="text-sm text-muted-foreground">{subtitle}</p>
  </header>
)

export const KpiStrip = ({ children, label }: { children: ReactNode; label: string }) => (
  <section aria-label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {children}
  </section>
)

export const AccentKpi = ({
  label,
  value,
  sub,
  tone,
  action,
}: {
  label: string
  value: string
  sub: string
  tone: keyof typeof accents
  action?: { label: string; href?: string; onClick?: () => void }
}) => (
  <div className={cn('rounded-xl border border-l-4 border-border bg-card p-4', accents[tone].split(' ')[0])}>
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={cn('mt-1 text-3xl font-semibold tabular-nums', accents[tone].split(' ')[1])}>{value}</p>
    <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
    {action?.href ? (
      <Link className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline" href={action.href}>
        {action.label}
      </Link>
    ) : action?.onClick ? (
      <button className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline" onClick={action.onClick} type="button">
        {action.label}
      </button>
    ) : null}
  </div>
)

export const ListCard = ({
  title,
  viewAll,
  empty,
  children,
}: {
  title: string
  viewAll?: { label: string; href: string }
  empty: string
  children: ReactNode
}) => (
  <section className="rounded-xl border border-border bg-card">
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {viewAll ? (
        <Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" href={viewAll.href}>
          {viewAll.label}
        </Link>
      ) : null}
    </div>
    <div className="divide-y divide-border px-4">
      {Children.count(children) ? children : <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>}
    </div>
  </section>
)

export const InitialsBadge = ({ text }: { text: string }) => (
  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
    {text.slice(0, 2).toUpperCase()}
  </span>
)

export const ListRow = ({
  lead,
  title,
  meta,
  trailing,
  onOpen,
  href,
}: {
  lead?: ReactNode
  title: string
  meta: string
  trailing?: ReactNode
  onOpen?: () => void
  href?: string
}) => {
  const body = (
    <span className="min-w-0 text-left">
      <span className="block truncate text-sm font-medium text-primary">{title}</span>
      <span className="block truncate text-xs text-muted-foreground">{meta}</span>
    </span>
  )
  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      {lead}
      {onOpen ? (
        <button className="min-w-0 flex-1 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen} type="button">
          {body}
        </button>
      ) : href ? (
        <Link className="min-w-0 flex-1 rounded-sm hover:underline" href={href}>
          {body}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/primitives.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/dashboard/role-overview/primitives.tsx apps/web/src/features/dashboard/role-overview/primitives.test.tsx
git commit -m "feat(dashboard): role dashboard heading, KPI and list primitives"
```

---

### Task 6: Project Officer overview

**Files:**
- Create: `apps/web/src/features/dashboard/role-overview/officer-overview.tsx`
- Test: `apps/web/src/features/dashboard/role-overview/officer-overview.test.tsx`

**Interfaces:**
- Consumes: `RoleOverview`, primitives, `StatusBadge` from `@/components/pathways`.
- Produces: `OfficerOverview({ data, fullName, onOpenActivity })` where `onOpenActivity(href: string)` receives `/projects/{projectId}/activities/{activityId}` (optionally `?review={updateId}` / `?expense={id}`), the format `dashboardActivityTarget` in `role-dashboard.tsx` already parses.

Layout (Figma Project Officer): heading title "Your workspace", subtitle `{date} · {project titles joined by " & "}`; KPIs: Assigned activities (info, sub "Across N projects"), Overdue (danger, sub `{code} · {n} days`, action View opens first overdue activity), Flagged proof (warning, sub "Action needed", action Resolve opens first flagged), Submitted this month (success, sub "Updates & expenses"). Row 2: `Your activities` (dot by status; badge Overdue/In progress/Planned/For review/Completed; View all -> `/projects`) and `Needs your attention` (warning callout per flagged proof with **Resubmit proof** button -> opens activity; danger callout per overdue activity with **Submit update** -> opens activity). Row 3: `Recent submissions` (InitialsBadge EX/UP; title `{label}` plus amount `PHP {amount}` or `{progress}%`; badge Verified/Approved -> success, Pending -> neutral, Rejected -> danger "Returned").

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RoleOverview } from '@pathways/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficerOverview } from './officer-overview'

const p = '20000000-0000-4000-8000-00000000000a'
const a = '40000000-0000-4000-8000-000000000001'
const u = '50000000-0000-4000-8000-000000000001'
const data = {
  contractVersion: 'dashboard.role-overview.v1',
  businessDate: '2026-10-04',
  projects: [{ id: p, code: 'P-1', title: 'FutureMakers NCR', status: 'ONGOING', programName: null, managerName: null }],
  myActivities: { count: 1, rows: [{ id: a, projectId: p, projectTitle: 'FutureMakers NCR', code: 'ACT-001', title: 'Technical skills training', status: 'IN_PROGRESS', overdue: true, plannedEndDate: '2026-09-20', progress: 40 }] },
  flaggedProof: { count: 1, rows: [{ updateId: u, activityId: a, projectId: p, activityCode: 'ACT-001', activityTitle: 'Technical skills training', reviewReason: 'Missing officer signatures.', reviewedAt: '2026-10-01T00:00:00.000Z' }] },
  recentSubmissions: { count: 1, rows: [{ kind: 'EXPENSE', id: u, projectId: p, activityId: a, label: 'Workshop materials', amount: '14800.00', progress: null, status: 'VERIFIED', submittedAt: '2026-10-02T00:00:00.000Z' }] },
  submittedThisMonth: { updates: 2, expenses: 1 },
  proofQueue: null,
  approvalQueue: null,
  datasetsImportedThisMonth: null,
  alerts: null,
} as RoleOverview

describe('OfficerOverview', () => {
  afterEach(cleanup)
  it('shows the four KPIs from the payload', () => {
    render(<OfficerOverview data={data} fullName="Ron Perez" onOpenActivity={vi.fn()} />)
    expect(screen.getByText('Assigned activities')).toBeTruthy()
    expect(screen.getByText('Submitted this month').parentElement?.textContent).toContain('3')
  })
  it('opens the activity review sheet from Resubmit proof', () => {
    const open = vi.fn()
    render(<OfficerOverview data={data} fullName="Ron Perez" onOpenActivity={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resubmit proof' }))
    expect(open).toHaveBeenCalledWith(`/projects/${p}/activities/${a}`)
  })
  it('labels a returned submission and formats the amount', () => {
    render(<OfficerOverview data={{ ...data, recentSubmissions: { count: 1, rows: [{ ...data.recentSubmissions!.rows[0], status: 'REJECTED' }] } }} fullName="Ron" onOpenActivity={vi.fn()} />)
    expect(screen.getByText('Returned')).toBeTruthy()
    expect(screen.getByText(/PHP 14,800.00/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/officer-overview.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
import type { RoleOverview } from '@pathways/shared'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { AccentKpi, DashboardHeading, InitialsBadge, KpiStrip, ListCard, ListRow } from './primitives'

type Data = RoleOverview
const activityHref = (projectId: string, activityId: string) => `/projects/${projectId}/activities/${activityId}`
const peso = (amount: string) => `PHP ${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const longDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const daysLate = (today: string, due: string | null) => (due ? Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0)
const statusBadge = (row: NonNullable<Data['myActivities']>['rows'][number]) =>
  row.overdue
    ? { text: 'Overdue', tone: 'danger' as const }
    : row.status === 'NOT_STARTED'
      ? { text: 'Planned', tone: 'neutral' as const }
      : row.status === 'FOR_REVIEW'
        ? { text: 'For review', tone: 'warning' as const }
        : row.status === 'COMPLETED'
          ? { text: 'Completed', tone: 'success' as const }
          : { text: 'In progress', tone: 'info' as const }
const submissionBadge = { PENDING: ['Pending', 'neutral'], VERIFIED: ['Verified', 'success'], APPROVED: ['Approved', 'success'], REJECTED: ['Returned', 'danger'] } as const

/** Project Officer home: assigned work, items needing action and own submissions. */
export const OfficerOverview = ({ data, fullName, onOpenActivity }: { data: Data; fullName?: string | null; onOpenActivity: (href: string) => void }) => {
  const activities = data.myActivities
  const overdue = activities?.rows.filter((row) => row.overdue) ?? []
  const flagged = data.flaggedProof
  const projectCount = new Set(activities?.rows.map((row) => row.projectId)).size
  return (
    <div className="space-y-6">
      <DashboardHeading
        fullName={fullName}
        title="Your workspace"
        subtitle={[longDate(data.businessDate), data.projects.map((p) => p.title).join(' & ')].filter(Boolean).join(' · ')}
      />
      <KpiStrip label="Your task counts">
        {activities ? <AccentKpi label="Assigned activities" sub={`Across ${projectCount} project${projectCount === 1 ? '' : 's'}`} tone="info" value={String(activities.count)} /> : null}
        {activities ? (
          <AccentKpi
            action={overdue[0] ? { label: 'View', onClick: () => onOpenActivity(activityHref(overdue[0].projectId, overdue[0].id)) } : undefined}
            label="Overdue"
            sub={overdue[0] ? `${overdue[0].code} · ${daysLate(data.businessDate, overdue[0].plannedEndDate)} days` : 'Nothing is past due'}
            tone="danger"
            value={String(overdue.length)}
          />
        ) : null}
        {flagged ? (
          <AccentKpi
            action={flagged.rows[0] ? { label: 'Resolve', onClick: () => onOpenActivity(activityHref(flagged.rows[0].projectId, flagged.rows[0].activityId)) } : undefined}
            label="Flagged proof"
            sub={flagged.count ? 'Action needed' : 'No returned proof'}
            tone="warning"
            value={String(flagged.count)}
          />
        ) : null}
        {data.submittedThisMonth ? (
          <AccentKpi label="Submitted this month" sub="Updates & expenses" tone="success" value={String(data.submittedThisMonth.updates + data.submittedThisMonth.expenses)} />
        ) : null}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        {activities ? (
          <ListCard empty="No activities are assigned to you." title="Your activities" viewAll={{ label: 'View all', href: '/projects' }}>
            {activities.rows.map((row) => {
              const badge = statusBadge(row)
              return (
                <ListRow
                  key={row.id}
                  meta={`${row.projectTitle} · ${row.plannedEndDate ? `${row.overdue ? 'Was due' : 'Due'} ${longDate(row.plannedEndDate)}` : 'No due date'} · ${row.progress}%`}
                  onOpen={() => onOpenActivity(activityHref(row.projectId, row.id))}
                  title={row.title}
                  trailing={<StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
                />
              )
            })}
          </ListCard>
        ) : null}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Needs your attention</h3>
          {flagged?.rows.map((row) => (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-subtle p-3" key={row.updateId}>
              <p className="text-sm font-semibold text-foreground">Proof returned · {row.activityCode}</p>
              <p className="text-sm text-foreground">{row.reviewReason || 'The reviewer returned this proof.'}</p>
              <Button onClick={() => onOpenActivity(activityHref(row.projectId, row.activityId))} size="sm" type="button">Resubmit proof</Button>
            </div>
          ))}
          {overdue.map((row) => (
            <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-subtle p-3" key={row.id}>
              <p className="text-sm font-semibold text-foreground">{row.code} is {daysLate(data.businessDate, row.plannedEndDate)} days overdue</p>
              <p className="text-sm text-foreground">{row.title} passed its planned end date. Submit a progress update.</p>
              <Button onClick={() => onOpenActivity(activityHref(row.projectId, row.id))} size="sm" type="button">Submit update</Button>
            </div>
          ))}
          {!flagged?.rows.length && !overdue.length ? <p className="py-4 text-center text-sm text-muted-foreground">Nothing needs your attention.</p> : null}
        </section>
      </div>
      {data.recentSubmissions ? (
        <ListCard empty="You have not submitted anything yet." title="Recent submissions">
          {data.recentSubmissions.rows.map((row) => {
            const [text, tone] = submissionBadge[row.status]
            return (
              <ListRow
                key={row.id}
                lead={<InitialsBadge text={row.kind === 'EXPENSE' ? 'EX' : 'UP'} />}
                meta={`Submitted ${new Date(row.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                onOpen={row.activityId ? () => onOpenActivity(activityHref(row.projectId, row.activityId as string)) : undefined}
                title={`${row.label} · ${row.amount ? peso(row.amount) : `${row.progress}%`}`}
                trailing={<StatusBadge tone={tone}>{text}</StatusBadge>}
              />
            )
          })}
        </ListCard>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/officer-overview.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/dashboard/role-overview/officer-overview.tsx apps/web/src/features/dashboard/role-overview/officer-overview.test.tsx
git commit -m "feat(dashboard): Project Officer role overview"
```

---

### Task 7: M&E Officer overview

**Files:**
- Create: `apps/web/src/features/dashboard/role-overview/me-overview.tsx`
- Test: `apps/web/src/features/dashboard/role-overview/me-overview.test.tsx`

**Interfaces:**
- Produces: `MeOverview({ data, fullName, onOpenActivity, evaluations })` where `evaluations: Array<{ projectId: string; title: string; score: string | null }>` is loaded by the caller (Task 9) from the existing `GET /projects/:id/evaluation` (`monitoring.read`); score shown raw, no label.

Layout (Figma M&E): title "Monitoring overview", subtitle date and project titles joined by " · ". KPIs: Active alerts (danger, sub `{critical} critical · {high} high`, action Review -> `/alerts`), Proof pending review (warning, sub "Submitted by officers", action Review opens first queue row with `?review={updateId}`), Evaluation snapshots (info, value = number of projects with a score, sub "Latest stored evaluation"), Datasets imported (success, sub "This month"). Row 2: `Active alerts requiring review` (severity dot, title, project title, explanation, recommendation chip in `bg-surface-subtle`; View all -> `/alerts`) and `Proof submissions awaiting review` (InitialsBadge from submitter initials; meta `{submitter} · Submitted {date} · {project}`; trailing **Review** button opens activity with `?review=`; Review all -> `/projects`). Row 3: `Evaluation snapshot — current state` grid of project tiles showing the raw score (`text-2xl`) or "No evaluation yet"; link "Open Monitor & Evaluate" -> `/projects/{id}/monitor-evaluate`.

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RoleOverview } from '@pathways/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeOverview } from './me-overview'

const p = '20000000-0000-4000-8000-00000000000a'
const a = '40000000-0000-4000-8000-000000000001'
const u = '50000000-0000-4000-8000-000000000001'
const data = {
  contractVersion: 'dashboard.role-overview.v1', businessDate: '2026-10-04',
  projects: [{ id: p, code: 'P-1', title: 'FutureMakers NCR', status: 'ONGOING', programName: null, managerName: null }],
  myActivities: null, flaggedProof: null, recentSubmissions: null, submittedThisMonth: null,
  proofQueue: { count: 1, rows: [{ updateId: u, activityId: a, projectId: p, projectTitle: 'FutureMakers NCR', activityCode: 'ACT-003', activityTitle: 'Progress update', submitterName: 'Ron Perez', submittedAt: '2026-10-02T00:00:00.000Z', progress: 57 }] },
  approvalQueue: null, datasetsImportedThisMonth: 6,
  alerts: { open: 3, capped: false, bySeverity: { CRITICAL: 2, HIGH: 1, MEDIUM: 0, LOW: 0 }, byProject: [{ projectId: p, open: 3, maxSeverity: 'CRITICAL' }], recent: [{ id: u, projectId: p, title: 'Budget depletion risk', severity: 'CRITICAL', explanation: '91% utilized', recommendation: 'Recommend reallocation', budget: true }] },
} as RoleOverview

describe('MeOverview', () => {
  afterEach(cleanup)
  it('splits active alerts by severity', () => {
    render(<MeOverview data={data} evaluations={[]} fullName="Leah Sy" onOpenActivity={vi.fn()} />)
    expect(screen.getByText('2 critical · 1 high')).toBeTruthy()
  })
  it('opens proof review with the update id', () => {
    const open = vi.fn()
    render(<MeOverview data={data} evaluations={[]} fullName="Leah Sy" onOpenActivity={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Review ACT-003' }))
    expect(open).toHaveBeenCalledWith(`/projects/${p}/activities/${a}?review=${u}`)
  })
  it('shows the stored evaluation score without a rating label', () => {
    render(<MeOverview data={data} evaluations={[{ projectId: p, title: 'FutureMakers NCR', score: '65' }]} fullName="Leah" onOpenActivity={vi.fn()} />)
    expect(screen.getByText('65')).toBeTruthy()
    expect(screen.queryByText(/Needs improvement|Good/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/me-overview.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
import type { RoleOverview } from '@pathways/shared'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AccentKpi, DashboardHeading, InitialsBadge, KpiStrip, ListCard, ListRow } from './primitives'

const dot = { CRITICAL: 'bg-danger', HIGH: 'bg-danger', MEDIUM: 'bg-warning', LOW: 'bg-muted-foreground' } as const
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** M&E Officer home: alerts, proof waiting for review, evaluation scores and imports. */
export const MeOverview = ({
  data,
  fullName,
  evaluations,
  onOpenActivity,
}: {
  data: RoleOverview
  fullName?: string | null
  evaluations: Array<{ projectId: string; title: string; score: string | null }>
  onOpenActivity: (href: string) => void
}) => {
  const alerts = data.alerts
  const queue = data.proofQueue
  const reviewHref = (row: NonNullable<RoleOverview['proofQueue']>['rows'][number]) =>
    `/projects/${row.projectId}/activities/${row.activityId}?review=${row.updateId}`
  return (
    <div className="space-y-6">
      <DashboardHeading fullName={fullName} subtitle={data.projects.map((p) => p.title).join(' · ')} title="Monitoring overview" />
      <KpiStrip label="Monitoring counts">
        {alerts ? (
          <AccentKpi action={{ label: 'Review', href: '/alerts' }} label="Active alerts" sub={`${alerts.bySeverity.CRITICAL} critical · ${alerts.bySeverity.HIGH} high`} tone="danger" value={`${alerts.open}${alerts.capped ? '+' : ''}`} />
        ) : null}
        {queue ? (
          <AccentKpi action={queue.rows[0] ? { label: 'Review', onClick: () => onOpenActivity(reviewHref(queue.rows[0])) } : undefined} label="Proof pending review" sub="Submitted by officers" tone="warning" value={String(queue.count)} />
        ) : null}
        <AccentKpi label="Evaluation snapshots" sub="Latest stored evaluation" tone="info" value={String(evaluations.filter((e) => e.score !== null).length)} />
        {data.datasetsImportedThisMonth !== null ? (
          <AccentKpi label="Datasets imported" sub="This month" tone="success" value={String(data.datasetsImportedThisMonth)} />
        ) : null}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        {alerts ? (
          <ListCard empty="No open alerts." title="Active alerts requiring review" viewAll={{ label: 'View all', href: '/alerts' }}>
            {alerts.recent.map((row) => (
              <div className="space-y-2 py-3" key={row.id}>
                <div className="flex items-start gap-2">
                  <span aria-hidden="true" className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot[row.severity])} />
                  <div className="min-w-0">
                    <Link className="text-sm font-medium text-primary hover:underline" href="/alerts">{row.title}</Link>
                    <p className="text-xs text-muted-foreground">{data.projects.find((p) => p.id === row.projectId)?.title ?? 'Project'} · {row.explanation}</p>
                  </div>
                </div>
                {row.recommendation ? <p className="rounded-md bg-surface-subtle px-3 py-1.5 text-xs text-foreground">{row.recommendation}</p> : null}
              </div>
            ))}
          </ListCard>
        ) : null}
        {queue ? (
          <ListCard empty="No proof is waiting for review." title="Proof submissions awaiting review" viewAll={{ label: 'Review all', href: '/projects' }}>
            {queue.rows.map((row) => (
              <ListRow
                key={row.updateId}
                lead={<InitialsBadge text={initials(row.submitterName)} />}
                meta={`${row.submitterName} · Submitted ${shortDate(row.submittedAt)} · ${row.projectTitle}`}
                title={`${row.activityCode} — ${row.activityTitle}`}
                trailing={
                  <Button aria-label={`Review ${row.activityCode}`} onClick={() => onOpenActivity(reviewHref(row))} size="sm" type="button">
                    Review
                  </Button>
                }
              />
            ))}
          </ListCard>
        ) : null}
      </div>
      <section className="rounded-xl border border-border bg-card">
        <div className="flex min-h-12 items-center border-b border-border px-4">
          <h3 className="text-sm font-semibold text-foreground">Evaluation snapshot — current state</h3>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {evaluations.map((row) => (
            <Link className="rounded-lg border border-border bg-surface-subtle p-3 hover:border-primary" href={`/projects/${row.projectId}/monitor-evaluate`} key={row.projectId}>
              <p className="truncate text-xs text-muted-foreground">{row.title}</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{row.score ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{row.score ? 'Stored evaluation score' : 'No evaluation yet'}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/me-overview.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/dashboard/role-overview/me-overview.tsx apps/web/src/features/dashboard/role-overview/me-overview.test.tsx
git commit -m "feat(dashboard): M&E Officer role overview"
```

---

### Task 8: Project Manager and portfolio (Program / Grant Manager) overviews

**Files:**
- Create: `apps/web/src/features/dashboard/role-overview/manager-overview.tsx`
- Create: `apps/web/src/features/dashboard/role-overview/portfolio-overview.tsx`
- Test: `apps/web/src/features/dashboard/role-overview/manager-overview.test.tsx`
- Test: `apps/web/src/features/dashboard/role-overview/portfolio-overview.test.tsx`

**Interfaces:**
- Consumes: `healthOf` (Task 4), primitives (Task 5), `ActionKpiRow` counts are NOT reused (counts come from the payload).
- Produces: `ManagerOverview({ data, fullName, metrics, onOpenActivity })` and `PortfolioOverview({ data, fullName, metrics, readOnly })`, where `metrics: Record<string, { kpi: string | null; budget: { percent: number; allocated: string; used: string } | null }>` keyed by project id, loaded by the caller (Task 9) from the existing `GET /projects/:projectId/overview-metrics` (`kpiAchievement`, `budgetUtilization`).

Project Manager layout: title "Project management overview", subtitle `{n} projects`; KPIs: Pending approvals (danger, from `approvalQueue.count`, action Review opens first row with `?expense=`), Active budget alerts (warning, count of `alerts.recent` with `budget` — sub "Require your decision", action View -> `/alerts`), Overdue activities (info, from `myActivities`? no: use `alerts`-independent count via existing action counts is NOT used; show count of projects' overdue from `data.myActivities` only when present, else hide), For review (success, `proofQueue?.count` hidden when null). Row 2: `Project health` cards per project (title, health badge from `healthOf`, `KPI {kpi}` `Budget {percent}%`, progress bar of budget percent with tone of the health label; link "Project directory" -> `/projects`) and `Pending your approval` (InitialsBadge EX; title `{description} · PHP {amount}`; meta `Verified by {name} · {project}`; **Approve** button opens activity sheet with `?expense={id}`; rows without `activityId` link to `/projects/{id}/budget`). Row 3: `Budget alerts requiring your decision` (rows from `alerts.recent.filter(budget)`, **Log outcome** -> `/alerts`).

Portfolio layout (Program and Grant Manager): title "Portfolio overview", subtitle `{n} projects across {m} programs`; KPIs: Active projects (info, status ONGOING count, sub `{planned} planned`), Critical / At risk / On track (counts of `healthOf` labels; sub lists up to two project titles). Row 2: `Portfolio health` rows (title, `{programName} · {managerName}`, KPI bar with %, health badge) and `Portfolio budget utilization` tiles (allocated, used, % bar; tone warning above 80, success otherwise, captioned "Visual guide only; alert thresholds come from configured rules"). Row 3: `Open alerts` list (severity dot, title, project, recommendation chip); trailing **Decide** -> `/alerts` only when `readOnly` is false. Grant Manager passes `readOnly`.

- [ ] **Step 1: Write the failing tests**

```tsx
// manager-overview.test.tsx
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RoleOverview } from '@pathways/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagerOverview } from './manager-overview'

const p = '20000000-0000-4000-8000-00000000000a'
const e = '60000000-0000-4000-8000-000000000001'
const a = '40000000-0000-4000-8000-000000000001'
const data = {
  contractVersion: 'dashboard.role-overview.v1', businessDate: '2026-10-04',
  projects: [{ id: p, code: 'P-1', title: 'FutureMakers NCR', status: 'ONGOING', programName: 'YEE', managerName: 'Jan Pascual' }],
  myActivities: null, flaggedProof: null, recentSubmissions: null, submittedThisMonth: null, proofQueue: null,
  approvalQueue: { count: 1, rows: [{ expenseId: e, activityId: a, projectId: p, projectTitle: 'FutureMakers NCR', description: 'Meals', amount: '27000.00', verifiedByName: 'Leah Sy', verifiedAt: '2026-10-02T00:00:00.000Z' }] },
  datasetsImportedThisMonth: null,
  alerts: { open: 1, capped: false, bySeverity: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 }, byProject: [{ projectId: p, open: 1, maxSeverity: 'CRITICAL' }], recent: [{ id: e, projectId: p, title: 'Budget depletion risk', severity: 'CRITICAL', explanation: '91% utilized', recommendation: null, budget: true }] },
} as RoleOverview

describe('ManagerOverview', () => {
  afterEach(cleanup)
  it('labels project health from open alerts', () => {
    render(<ManagerOverview counts={null} data={data} fullName="Jan" metrics={{ [p]: { kpi: '57%', budget: { percent: 76, allocated: '1200000', used: '912000' } } }} onOpenActivity={vi.fn()} />)
    expect(screen.getByText('Critical')).toBeTruthy()
  })
  it('opens expense approval in the activity sheet', () => {
    const open = vi.fn()
    render(<ManagerOverview counts={null} data={data} fullName="Jan" metrics={{}} onOpenActivity={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve Meals' }))
    expect(open).toHaveBeenCalledWith(`/projects/${p}/activities/${a}?expense=${e}`)
  })
})
```

```tsx
// portfolio-overview.test.tsx
/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import type { RoleOverview } from '@pathways/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { PortfolioOverview } from './portfolio-overview'

const p1 = '20000000-0000-4000-8000-00000000000a'
const p2 = '20000000-0000-4000-8000-00000000000b'
const data = {
  contractVersion: 'dashboard.role-overview.v1', businessDate: '2026-10-04',
  projects: [
    { id: p1, code: 'P-1', title: 'FutureMakers NCR', status: 'ONGOING', programName: 'YEE', managerName: 'Jan Pascual' },
    { id: p2, code: 'P-2', title: 'Safe Spaces', status: 'PLANNED', programName: 'CP', managerName: null },
  ],
  myActivities: null, flaggedProof: null, recentSubmissions: null, submittedThisMonth: null, proofQueue: null, approvalQueue: null, datasetsImportedThisMonth: null,
  alerts: { open: 1, capped: false, bySeverity: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 }, byProject: [{ projectId: p1, open: 1, maxSeverity: 'CRITICAL' }], recent: [{ id: p2, projectId: p1, title: 'Budget depletion risk', severity: 'CRITICAL', explanation: '91% utilized', recommendation: 'Review reallocation', budget: true }] },
} as RoleOverview

describe('PortfolioOverview', () => {
  afterEach(cleanup)
  it('counts health labels and treats planned projects as Planned', () => {
    render(<PortfolioOverview data={data} fullName="Maria" metrics={{}} readOnly={false} />)
    expect(screen.getByText('Critical').parentElement?.textContent).toContain('1')
    expect(screen.getByText('Planned')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Decide' })).toBeTruthy()
  })
  it('hides decision buttons for the read-only Grant Manager view', () => {
    render(<PortfolioOverview data={data} fullName="Gina" metrics={{}} readOnly />)
    expect(screen.queryByRole('link', { name: 'Decide' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/manager-overview.test.tsx src/features/dashboard/role-overview/portfolio-overview.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`manager-overview.tsx`:

```tsx
import type { DashboardActionCounts, RoleOverview } from '@pathways/shared'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { healthOf } from './health'
import { AccentKpi, DashboardHeading, InitialsBadge, KpiStrip, ListCard, ListRow } from './primitives'

export type ProjectMetrics = Record<string, { kpi: string | null; budget: { percent: number; allocated: string; used: string } | null }>
const bar = { danger: 'bg-danger', warning: 'bg-warning', success: 'bg-success', neutral: 'bg-muted-foreground' } as const
const peso = (amount: string) => `PHP ${Number(amount).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

/** Project Manager home: project health from alerts, expense approvals and budget alerts. */
export const ManagerOverview = ({ data, counts, fullName, metrics, onOpenActivity }: { data: RoleOverview; counts: DashboardActionCounts | null; fullName?: string | null; metrics: ProjectMetrics; onOpenActivity: (href: string) => void }) => {
  const byProject = new Map(data.alerts?.byProject.map((row) => [row.projectId, row]))
  const budgetAlerts = data.alerts?.recent.filter((row) => row.budget) ?? []
  const approvals = data.approvalQueue
  const approveHref = (row: NonNullable<RoleOverview['approvalQueue']>['rows'][number]) =>
    row.activityId ? `/projects/${row.projectId}/activities/${row.activityId}?expense=${row.expenseId}` : null
  return (
    <div className="space-y-6">
      <DashboardHeading fullName={fullName} subtitle={`Managing ${data.projects.length} project${data.projects.length === 1 ? '' : 's'}`} title="Project management overview" />
      <KpiStrip label="Management counts">
        {approvals ? <AccentKpi label="Pending approvals" sub="Expenses verified by M&E" tone="danger" value={String(approvals.count)} /> : null}
        {data.alerts ? <AccentKpi action={{ label: 'View', href: '/alerts' }} label="Active budget alerts" sub="Require your decision" tone="warning" value={String(budgetAlerts.length)} /> : null}
        {counts?.overdueActivities ? (
          <AccentKpi
            label="Overdue activities"
            sub={counts.overdueActivities.mostOverdue ? `${counts.overdueActivities.mostOverdue.code} · ${counts.overdueActivities.mostOverdue.daysLate} days` : 'Nothing is past due'}
            tone="info"
            value={String(counts.overdueActivities.count)}
          />
        ) : null}
        {counts && counts.forReview !== null ? <AccentKpi label="For review" sub="Activity submitted" tone="success" value={String(counts.forReview)} /> : null}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        <ListCard empty="No projects are in your scope." title="Project health" viewAll={{ label: 'Project directory', href: '/projects' }}>
          {data.projects.map((project) => {
            const health = healthOf(project.status, byProject.get(project.id))
            const m = metrics[project.id]
            return (
              <div className="space-y-2 py-3" key={project.id}>
                <div className="flex items-center justify-between gap-2">
                  <a className="truncate text-sm font-medium text-primary hover:underline" href={`/projects/${project.id}`}>{project.title}</a>
                  <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">KPI {m?.kpi ?? '—'} · Budget {m?.budget ? `${m.budget.percent}%` : '—'}</p>
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', bar[health.tone])} style={{ width: `${Math.min(100, m?.budget?.percent ?? 0)}%` }} />
                </div>
              </div>
            )
          })}
          <p className="pb-3 text-xs text-muted-foreground">Health reflects open rule-based alerts, not a success score.</p>
        </ListCard>
        {approvals ? (
          <ListCard empty="Nothing is waiting for your approval." title="Pending your approval">
            {approvals.rows.map((row) => {
              const href = approveHref(row)
              return (
                <ListRow
                  href={href ? undefined : `/projects/${row.projectId}/budget`}
                  key={row.expenseId}
                  lead={<InitialsBadge text="EX" />}
                  meta={`Verified by ${row.verifiedByName ?? 'M&E'} · ${row.projectTitle}`}
                  title={`${row.description} · ${peso(row.amount)}`}
                  trailing={href ? <Button aria-label={`Approve ${row.description}`} onClick={() => onOpenActivity(href)} size="sm" type="button">Approve</Button> : null}
                />
              )
            })}
          </ListCard>
        ) : null}
      </div>
      {data.alerts ? (
        <ListCard empty="No budget alerts are open." title="Budget alerts requiring your decision" viewAll={{ label: 'Go to alerts', href: '/alerts' }}>
          {budgetAlerts.map((row) => (
            <ListRow
              href="/alerts"
              key={row.id}
              meta={row.explanation}
              title={`${row.title} · ${row.severity.charAt(0)}${row.severity.slice(1).toLowerCase()}`}
              trailing={<Button asChild size="sm"><a href="/alerts">Log outcome</a></Button>}
            />
          ))}
        </ListCard>
      ) : null}
    </div>
  )
}
```

The "Overdue activities" and "For review" tiles read the existing `GET /dashboards/action-counts` payload (`DashboardActionCounts`), passed in as `counts`; a `null` field hides its tile.

`portfolio-overview.tsx`:

```tsx
import type { RoleOverview } from '@pathways/shared'
import Link from 'next/link'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { healthOf } from './health'
import type { ProjectMetrics } from './manager-overview'
import { AccentKpi, DashboardHeading, KpiStrip, ListCard } from './primitives'

const bar = { danger: 'bg-danger', warning: 'bg-warning', success: 'bg-success', neutral: 'bg-muted' } as const
const dot = { CRITICAL: 'bg-danger', HIGH: 'bg-danger', MEDIUM: 'bg-warning', LOW: 'bg-muted-foreground' } as const
const peso = (amount: string) => `PHP ${Number(amount).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

/** Program and Grant Manager portfolio; Grant Manager is read-only with no decision buttons. */
export const PortfolioOverview = ({ data, fullName, metrics, readOnly }: { data: RoleOverview; fullName?: string | null; metrics: ProjectMetrics; readOnly: boolean }) => {
  const byProject = new Map(data.alerts?.byProject.map((row) => [row.projectId, row]))
  const rows = data.projects.map((project) => ({ project, health: healthOf(project.status, byProject.get(project.id)) }))
  const named = (label: string) => rows.filter((row) => row.health.label === label)
  const programs = new Set(data.projects.map((p) => p.programName).filter(Boolean)).size
  const kpi = (label: 'Critical' | 'At risk' | 'On track', tone: 'danger' | 'warning' | 'success') => (
    <AccentKpi label={label} sub={named(label).slice(0, 2).map((row) => row.project.title).join(' · ') || 'None'} tone={tone} value={String(named(label).length)} />
  )
  return (
    <div className="space-y-6">
      <DashboardHeading fullName={fullName} subtitle={`${data.projects.length} projects across ${programs} program${programs === 1 ? '' : 's'}`} title="Portfolio overview" />
      <KpiStrip label="Portfolio counts">
        <AccentKpi label="Active projects" sub={`${named('Planned').length} planned`} tone="info" value={String(data.projects.filter((p) => p.status === 'ONGOING').length)} />
        {kpi('Critical', 'danger')}
        {kpi('At risk', 'warning')}
        {kpi('On track', 'success')}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        <ListCard empty="No projects are in your portfolio." title="Portfolio health" viewAll={{ label: 'Project directory', href: '/projects' }}>
          {rows.map(({ project, health }) => {
            const value = metrics[project.id]?.kpi
            return (
              <div className="flex items-center gap-3 py-3" key={project.id}>
                <div className="min-w-0 flex-1">
                  <Link className="block truncate text-sm font-medium text-primary hover:underline" href={`/projects/${project.id}`}>{project.title}</Link>
                  <p className="truncate text-xs text-muted-foreground">{[project.programName, project.managerName].filter(Boolean).join(' · ')}</p>
                </div>
                <div aria-hidden="true" className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', bar[health.tone])} style={{ width: `${Math.min(100, Number.parseFloat(value ?? '0'))}%` }} />
                </div>
                <span className="w-12 text-right text-sm tabular-nums">{value ?? '—'}</span>
                <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
              </div>
            )
          })}
          <p className="pb-3 text-xs text-muted-foreground">Health reflects open rule-based alerts, not a success score.</p>
        </ListCard>
        <section className="rounded-xl border border-border bg-card">
          <div className="flex min-h-12 items-center border-b border-border px-4">
            <h3 className="text-sm font-semibold text-foreground">Portfolio budget utilization</h3>
          </div>
          <div className="space-y-3 p-4">
            {data.projects.map((project) => {
              const budget = metrics[project.id]?.budget
              return budget ? (
                <div className="space-y-1 rounded-lg border border-border bg-surface-subtle p-3" key={project.id}>
                  <div className="flex justify-between text-sm"><span className="font-medium">{project.title}</span><span className="tabular-nums">{budget.percent}%</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>{peso(budget.allocated)} allocated</span><span>{peso(budget.used)} used</span></div>
                  <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', budget.percent > 80 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, budget.percent)}%` }} />
                  </div>
                </div>
              ) : null
            })}
            <p className="text-xs text-muted-foreground">Bar colors are a visual guide only; alert thresholds come from configured rules.</p>
          </div>
        </section>
      </div>
      {data.alerts ? (
        <ListCard empty="No open alerts in your portfolio." title="Open alerts" viewAll={{ label: 'View all', href: '/alerts' }}>
          {data.alerts.recent.map((row) => (
            <div className="flex items-start gap-3 py-3" key={row.id}>
              <span aria-hidden="true" className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot[row.severity])} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-primary">{row.title}</p>
                <p className="text-xs text-muted-foreground">{data.projects.find((p) => p.id === row.projectId)?.title ?? 'Project'} · {row.explanation}</p>
                {row.recommendation ? <p className="rounded-md bg-surface-subtle px-3 py-1.5 text-xs">{row.recommendation}</p> : null}
              </div>
              {readOnly ? null : <Button asChild size="sm"><Link href="/alerts">Decide</Link></Button>}
            </div>
          ))}
        </ListCard>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview`
Expected: PASS (all role-overview tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/dashboard/role-overview
git commit -m "feat(dashboard): Project Manager and portfolio role overviews"
```

---

### Task 9: Wire role overviews into the dashboard

**Files:**
- Create: `apps/web/src/features/dashboard/role-overview/role-overview.tsx`
- Modify: `apps/web/src/features/dashboard/role-dashboard.tsx` (render `RoleOverviewDashboard` for non-System-Administrator roles; keep everything else as the System Administrator path)
- Test: `apps/web/src/features/dashboard/role-overview/role-overview.test.tsx`; update `apps/web/src/features/dashboard/role-dashboard-authorization.test.ts` if it asserts the old heading for non-admin roles.

**Interfaces:**
- Consumes: `useRoleOverview` (Task 4), the four compositions, `pathwaysClient.getProjectOverviewMetrics(projectId)` and `pathwaysClient.getProjectEvaluation(projectId)` (find the exact existing method names in `apps/web/src/lib/services/*client*.ts` with `grep -n "overview-metrics\|/evaluation" apps/web/src/lib/services`; use them as they exist), `DashboardActivityReviewPanel` and `dashboardActivityTarget` from `role-dashboard.tsx` (export them).
- Produces: `RoleOverviewDashboard({ role, fullName })`.

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => ({ value: { eligible: true, data: null as unknown, isError: false, refetch: vi.fn() } }))
vi.mock('./use-role-overview', () => ({ useRoleOverview: () => read.value }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))

import { RoleOverviewDashboard } from './role-overview'

describe('RoleOverviewDashboard', () => {
  afterEach(cleanup)
  it('shows the Figma loading card while the payload loads', () => {
    render(<RoleOverviewDashboard fullName="Ron" role="Project Officer" />)
    expect(screen.getByText('Loading your dashboard')).toBeTruthy()
  })
  it('shows a retryable error state', () => {
    read.value = { ...read.value, isError: true }
    render(<RoleOverviewDashboard fullName="Ron" role="Project Officer" />)
    expect(screen.getByText('Dashboard unavailable')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/dashboard/role-overview/role-overview.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`role-overview.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

import { AsyncState } from '@/components/pathways'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import type { PathwaysRole } from '@/types/pathways-role'
import { DashboardActivityReviewPanel, dashboardActivityTarget } from '../role-dashboard'
import { type ProjectMetrics, ManagerOverview } from './manager-overview'
import { MeOverview } from './me-overview'
import { OfficerOverview } from './officer-overview'
import { PortfolioOverview } from './portfolio-overview'
import { useRoleOverview } from './use-role-overview'
import { useProjectExtras } from './use-project-extras'

/** Picks the Figma layout for the viewer role; System Administrator never reaches this. */
export const RoleOverviewDashboard = ({ role, fullName }: { role: PathwaysRole; fullName?: string | null }) => {
  const read = useRoleOverview()
  const [target, setTarget] = useState<ReturnType<typeof dashboardActivityTarget>>(null)
  const extras = useProjectExtras(read.data?.projects ?? [], role)
  // Overdue and For review tiles reuse the existing action counts read.
  const counts = useAuthorizedRead('dashboard-action-counts', null, 'projects.read', () => pathwaysClient.getDashboardActionCounts())
  if (read.isError)
    return <AsyncState description="Your dashboard could not be loaded." onRetry={() => void read.refetch()} status="error" title="Dashboard unavailable" />
  if (!read.data) return <AsyncState description="Loading the records in your scope." status="loading" title="Loading your dashboard" />
  const open = (href: string) => setTarget(dashboardActivityTarget(href))
  const data = read.data
  return (
    <>
      {role === 'Project Officer' ? <OfficerOverview data={data} fullName={fullName} onOpenActivity={open} /> : null}
      {role === 'Monitoring and Evaluation Officer' ? <MeOverview data={data} evaluations={extras.evaluations} fullName={fullName} onOpenActivity={open} /> : null}
      {role === 'Project Manager' ? <ManagerOverview counts={counts.data ?? null} data={data} fullName={fullName} metrics={extras.metrics} onOpenActivity={open} /> : null}
      {role === 'Program Manager' || role === 'Grant Manager' ? <PortfolioOverview data={data} fullName={fullName} metrics={extras.metrics} readOnly={role === 'Grant Manager'} /> : null}
      <DashboardActivityReviewPanel onActivityChanged={() => void read.refetch()} onClose={() => setTarget(null)} role={role} target={target} />
    </>
  )
}
```

Create `use-project-extras.ts` that, for up to 20 project ids, loads overview metrics (Project Manager, Program Manager, Grant Manager) or evaluations (M&E) with `Promise.allSettled`, mapping a failed or forbidden call to `kpi: null, budget: null` / `score: null` (never throws, never blocks render). Map `overview-metrics` fields: `kpi` = formatted `kpiAchievement.metric` cell value with `%` when `state === 'AVAILABLE'` else `null`; `budget` = `{ percent: round(100 * countableSpending / approvedBudget), allocated: approvedBudget, used: countableSpending }` only when both are available, else `null`. Evaluation: `score` = `evaluation.overallScore` string or `null`.

In `role-dashboard.tsx`: `export` `dashboardActivityTarget` and `DashboardActivityReviewPanel`; in `RoleDashboard`, before the existing loading branch, add:

```tsx
  if (role && role !== 'System Administrator') return <RoleOverviewDashboard fullName={profile?.fullName} role={role} />
```

(Place the early return after all hooks to respect the rules of hooks; move it below the existing `useEffect`/`useState` calls.)

- [ ] **Step 4: Run tests, typecheck and build**

Run: `pnpm --filter web exec vitest run src/features/dashboard` then `pnpm --filter web exec tsc --noEmit` then `pnpm --filter web build`
Expected: PASS; tsc 0; build 0. Update any `role-dashboard-authorization.test.ts` assertion that expected the old non-admin heading to assert the new one (do not delete the permission assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/dashboard
git commit -m "feat(dashboard): route non-admin roles to the Figma role overviews"
```

---

### Task 10: Docs and DSD consolidation

**Files:**
- Modify: `docs/dsd-pathways.md` (section 4 implemented specs: accent KPI card, list card, health label from alerts rule, no success label, initials badge)
- Modify: `docs/prd-pathways.md` (PRD-F8 dashboard section: role layouts, health-from-alerts rule, Grant Manager read-only)
- Modify: `docs/deferred-features.md` (Request extension and Escalated alerts: "Plan 2")
- Modify: `docs/activity-log.md`, `docs/index.md` (register this plan)

- [ ] **Step 1: Write the DSD additions** (exact text)

```markdown
#### Role dashboard KPI card (implemented)
Bordered `bg-card` card, `rounded-xl`, 4px left accent in the semantic tone (danger, warning, primary for info, success); uppercase `text-xs` label, `text-3xl` tabular value in the tone, muted sub-line, optional one text action (44px target).

#### Project health label (implemented)
Derived only from open rule-based alerts: Critical (open CRITICAL alert), At risk (open HIGH or MEDIUM alert), On track (no open alert), Planned (project status). It is not a success rating and its caption says so. Evaluation scores show the stored number without a quality label.
```

- [ ] **Step 2: PRD, deferred register, activity log, index** (one bullet each; no test)

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: role dashboard patterns, health-from-alerts rule and Plan 2 deferrals"
```
