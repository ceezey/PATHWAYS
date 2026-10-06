import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import {
  type ComputedCriterionType,
  EvaluationMetricsService,
  isComputedCriterionType,
} from './evaluation-metrics'

const projectIdSchema = z.string().uuid()
// Locked auth RFC: System Administrator is denied assessment/survey detail and
// Program/Grant Managers are aggregate-only, independent of any stored grant.
const assessmentDetailDeniedRoles = new Set([
  'SYSTEM_ADMINISTRATOR',
  'PROGRAM_MANAGER',
  'GRANT_MANAGER',
])
const criterionNumber = z
  .number()
  .finite()
  .positive()
  .max(1000000)
  .refine((value) => new Prisma.Decimal(value.toString()).decimalPlaces() <= 4)
export const initialCriteriaSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    criteria: z
      .array(
        z
          .object({
            code: z
              .string()
              .trim()
              .min(1)
              .max(80)
              .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
            name: z.string().trim().min(1).max(200),
            description: z.string().trim().max(2000).optional(),
            type: z.enum([
              'KPI',
              'TIMELINE_COMPLIANCE',
              'BUDGET_EFFICIENCY',
              'BENEFICIARY_REACH',
              'OTHER',
            ]),
            weightPercentage: criterionNumber.refine((value) => value <= 100),
            maximumScore: criterionNumber,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine(({ criteria }, context) => {
    if (new Set(criteria.map((row) => row.code)).size !== criteria.length)
      context.addIssue({ code: 'custom', message: 'Criterion codes must be unique.' })
    if (
      !criteria
        .reduce((sum, row) => sum.add(row.weightPercentage.toString()), new Prisma.Decimal(0))
        .equals(100)
    )
      context.addIssue({ code: 'custom', message: 'Weights must total 100 percent.' })
  })
const initializationReceipt = z
  .object({
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    criteria: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            code: z.string(),
            version: z.literal(1),
            status: z.literal('DRAFT'),
            updatedAt: z.string().datetime({ offset: true }),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
export const evaluationWeightsSchema = z
  .object({
    criteria: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            weightPercentage: z.number().finite().min(0).max(100).multipleOf(0.0001),
            expectedUpdatedAt: z.string().datetime({ offset: true }),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine(({ criteria }, context) => {
    if (new Set(criteria.map((row) => row.id)).size !== criteria.length)
      context.addIssue({ code: 'custom', message: 'Each criterion must appear once.' })
    if (
      Math.round(criteria.reduce((sum, row) => sum + row.weightPercentage, 0) * 10000) !== 1000000
    )
      context.addIssue({ code: 'custom', message: 'Configured weights must total 100 percent.' })
  })
export const publishCriteriaSchema = z
  .object({
    criteria: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            expectedUpdatedAt: z.string().datetime({ offset: true }),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine(({ criteria }, context) => {
    if (new Set(criteria.map((row) => row.id)).size !== criteria.length)
      context.addIssue({ code: 'custom', message: 'Each criterion must appear once.' })
  })
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).valueOf()))
export const createEvaluationSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    periodLabel: z.string().trim().min(1).max(80).optional(),
    periodStart: dateOnly,
    periodEnd: dateOnly,
  })
  .strict()
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: 'The period end cannot be before its start.',
    path: ['periodEnd'],
  })
const manualScoreNumber = z.number().finite().min(0).max(1000000).multipleOf(0.0001)
export const saveScoresSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    commentary: z.string().trim().max(4000).optional(),
    scores: z
      .array(
        z
          .object({
            criterionId: z.string().uuid(),
            manualScore: manualScoreNumber.optional(),
            note: z.string().trim().max(2000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine(({ scores }, context) => {
    if (new Set(scores.map((row) => row.criterionId)).size !== scores.length)
      context.addIssue({ code: 'custom', message: 'Each criterion must appear once.' })
  })
export const submitEvaluationSchema = z
  .object({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
  .strict()
export const returnEvaluationSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()
export const signoffEvaluationSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    feedback: z.string().trim().min(1).max(2000),
  })
  .strict()

type Tx = Prisma.TransactionClient
const person = { select: { id: true, fullName: true } } as const
const named = (value: { id: string; fullName: string } | null) =>
  value ? { id: value.id, name: value.fullName.slice(0, 200) } : null
const day = (value: Date) => value.toISOString().slice(0, 10)

const maxEvaluations = 20
const manualMarker = ' Manual score recorded: '
// Allowlist for the stored criterion snapshot; numbers become strings and any other key is dropped.
const snapshotNumber = z.union([z.string(), z.number()]).transform(String)
const criterionSnapshotView = z.object({
  id: z.string(),
  code: z.string(),
  version: z.number().int(),
  type: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  weight_percentage: snapshotNumber,
  maximum_score: snapshotNumber,
})

const evaluationDetailSelect = {
  id: true,
  title: true,
  periodLabel: true,
  periodStart: true,
  periodEnd: true,
  overallScore: true,
  commentary: true,
  returnReason: true,
  status: true,
  updatedAt: true,
  evaluatedBy: person,
  evaluatedAt: true,
  reviewedBy: person,
  reviewedAt: true,
  reviewFeedback: true,
  signedOffBy: person,
  signedOffAt: true,
} as const
type EvaluationDetailRow = Prisma.ProjectEvaluationGetPayload<{
  select: typeof evaluationDetailSelect
}>
const scoreDetailSelect = {
  evaluationId: true,
  criterionId: true,
  score: true,
  maximumScore: true,
  weightedScore: true,
  commentary: true,
  criterionSnapshot: true,
} as const
type ScoreDetailRow = Prisma.ProjectEvaluationScoreGetPayload<{ select: typeof scoreDetailSelect }>

function mapEvaluationDetail(row: EvaluationDetailRow, scores: ScoreDetailRow[]) {
  return {
    id: row.id,
    title: row.title,
    periodLabel: row.periodLabel,
    periodStart: day(row.periodStart),
    periodEnd: day(row.periodEnd),
    overallScore: row.overallScore?.toString() ?? null,
    commentary: row.commentary,
    returnReason: row.returnReason,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    evaluatedBy: named(row.evaluatedBy),
    evaluatedAt: row.evaluatedAt?.toISOString() ?? null,
    reviewedBy: named(row.reviewedBy),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewFeedback: row.reviewFeedback,
    signedOffBy: named(row.signedOffBy),
    signedOffAt: row.signedOffAt?.toISOString() ?? null,
    scores: scores.map(mapScore),
  }
}

function mapScore(score: ScoreDetailRow) {
  const parsed = criterionSnapshotView.safeParse(score.criterionSnapshot)
  const criterion = parsed.success
    ? parsed.data
    : {
        id: score.criterionId,
        code: '',
        version: 0,
        type: 'OTHER',
        name: 'Criterion unavailable',
        description: null,
        weight_percentage: '0',
        maximum_score: score.maximumScore.toString(),
      }
  const marked = score.commentary?.indexOf(manualMarker) ?? -1
  const manual = criterion.type === 'OTHER' || marked >= 0
  return {
    criterionId: score.criterionId,
    score: score.score.toString(),
    maximumScore: score.maximumScore.toString(),
    weightedScore: score.weightedScore.toString(),
    commentary: score.commentary,
    source: manual ? ('manual' as const) : ('computed' as const),
    note: !manual
      ? null
      : marked >= 0
        ? (score.commentary?.slice(marked + manualMarker.length) ?? null)
        : score.commentary,
    criterion,
  }
}

@Injectable()
export class EvaluationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvaluationMetricsService) private readonly metrics: EvaluationMetricsService,
  ) {}

  // Shared by initializeCriteria (System Administrator, settings.configure; used by the
  // seed and as a fallback) and createCriteria (Monitoring and Evaluation Officer,
  // evaluations.weights.configure). Both insert the same first draft set under the same
  // idempotency receipt, so either path can start a project's criteria exactly once.
  private async insertCriteriaSet(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    body: z.infer<typeof initialCriteriaSchema>,
  ) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ projectId, criteria: body.criteria }))
      .digest('hex')
    await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`pathways:criterion-initialize:${actor.organizationId}:${projectId}`},0))`
    await this.requireProject(tx, actor, projectId)
    await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`pathways:criterion-request:${actor.organizationId}:${actor.userId}:${body.clientRequestId}`},0))`
    const receipt = await tx.auditLog.findFirst({
      where: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'EVALUATION_CRITERIA_INITIALIZED',
        entityType: 'ProjectEvaluationCriterionSet',
        entityId: body.clientRequestId,
      },
      select: { projectId: true, changes: true },
    })
    if (receipt) {
      const saved = initializationReceipt.safeParse(receipt.changes)
      if (receipt.projectId !== projectId || !saved.success || saved.data.requestHash !== hash)
        throw new ConflictException('Criterion request already used with different content.')
      return { criteria: saved.data.criteria }
    }
    const existing = await tx.projectEvaluationCriterion.findMany({
      where: { organizationId: actor.organizationId, projectId },
      select: { id: true },
      take: 101,
    })
    if (existing.length) throw new ConflictException('Project criteria already initialized.')
    const criteria = []
    for (const row of body.criteria) {
      const created = await tx.projectEvaluationCriterion.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          createdById: actor.userId,
          code: row.code,
          name: row.name,
          description: row.description ?? null,
          type: row.type,
          version: 1,
          status: 'DRAFT',
          weightPercentage: new Prisma.Decimal(row.weightPercentage.toString()),
          maximumScore: new Prisma.Decimal(row.maximumScore.toString()),
        },
        select: { id: true, code: true, version: true, status: true, updatedAt: true },
      })
      criteria.push({ ...created, updatedAt: created.updatedAt.toISOString() })
    }
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        actorUserId: actor.userId,
        action: 'EVALUATION_CRITERIA_INITIALIZED',
        entityType: 'ProjectEvaluationCriterionSet',
        entityId: body.clientRequestId,
        changes: { requestHash: hash, criteria },
      },
    })
    return { criteria }
  }

  initializeCriteria(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = initialCriteriaSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException(
        'Supply unique draft criteria with positive weights totaling 100 percent.',
      )
    const body = {
      ...parsed.data,
      criteria: [...parsed.data.criteria].sort((a, b) => a.code.localeCompare(b.code, 'en')),
    }
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'settings.configure',
      async (tx, actor) => {
        if (
          !hasAtomicPermission(actor.roles[0], actor.permissions, 'monitoring.read') ||
          !hasAtomicPermission(actor.roles[0], actor.permissions, 'audit.read')
        )
          throw new ForbiddenException('Current criterion and audit access required.')
        const id = await this.requireProject(tx, actor, projectId)
        return this.insertCriteriaSet(tx, actor, id, body)
      },
    )
  }

  // Monitoring and Evaluation Officer starts its own project's criteria set; the seed
  // and any legacy caller keep using initializeCriteria (settings.configure) above.
  createCriteria(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = initialCriteriaSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException(
        'Supply unique draft criteria with positive weights totaling 100 percent.',
      )
    const body = {
      ...parsed.data,
      criteria: [...parsed.data.criteria].sort((a, b) => a.code.localeCompare(b.code, 'en')),
    }
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.weights.configure',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        return this.insertCriteriaSet(tx, actor, id, body)
      },
    )
  }

  // Locks and publishes the complete draft set at once, mirroring configureWeights'
  // optimistic-concurrency shape: the client must send every current draft row.
  publishCriteria(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = publishCriteriaSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('Supply the complete draft criteria set to publish.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.weights.configure',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const rows = await tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>`
        SELECT id::text AS id,updated_at AS "updatedAt" FROM pathways.project_evaluation_criteria
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND status='DRAFT'
          AND archived_at IS NULL ORDER BY id LIMIT 101 FOR UPDATE
      `
        if (rows.length === 0) throw new ConflictException('No draft criteria to publish.')
        const wanted = new Map(parsed.data.criteria.map((row) => [row.id, row]))
        if (
          rows.length !== wanted.size ||
          rows.some(
            (row) =>
              !wanted.has(row.id) ||
              wanted.get(row.id)?.expectedUpdatedAt !== row.updatedAt.toISOString(),
          )
        )
          throw new ConflictException(
            'Draft criteria changed. Reload the complete draft set before publishing.',
          )
        const weights = await tx.projectEvaluationCriterion.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            status: 'DRAFT',
            archivedAt: null,
          },
          select: { weightPercentage: true },
        })
        const total = weights.reduce(
          (sum, row) => sum.add(row.weightPercentage.toString()),
          new Prisma.Decimal(0),
        )
        if (!total.equals(100))
          throw new BadRequestException(
            'Draft criteria weights must total 100 percent before publishing.',
          )
        const now = new Date()
        for (const row of rows) {
          const changed = await tx.projectEvaluationCriterion.updateMany({
            where: {
              organizationId: actor.organizationId,
              projectId: id,
              id: row.id,
              status: 'DRAFT',
              updatedAt: row.updatedAt,
            },
            data: {
              status: 'PUBLISHED',
              publishedById: actor.userId,
              publishedAt: now,
              updatedAt: now,
            },
          })
          if (changed.count !== 1)
            throw new ConflictException('Draft criterion changed. Reload before retrying.')
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_CRITERIA_PUBLISHED',
            entityType: 'ProjectEvaluationCriterion',
            entityId: id,
            changes: { criterionIds: rows.map((row) => row.id) },
          },
        })
        return { projectId: id, published: rows.length }
      },
    )
  }

  private async requireProject(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    input: string,
  ) {
    const parsed = projectIdSchema.safeParse(input)
    if (!parsed.success) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: parsed.data }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project.id
  }

  private async requireEvaluation(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    evaluationId: string,
  ) {
    const parsed = projectIdSchema.safeParse(evaluationId)
    if (!parsed.success) throw new NotFoundException('Evaluation unavailable.')
    const row = await tx.projectEvaluation.findFirst({
      where: { organizationId: actor.organizationId, projectId, id: parsed.data },
      select: { id: true, status: true, updatedAt: true, evaluatedById: true, periodEnd: true },
    })
    if (!row) throw new NotFoundException('Evaluation unavailable.')
    return row
  }

  // Reads every given evaluation's scores in one query and groups them in memory.
  private async withScores(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    rows: EvaluationDetailRow[],
  ) {
    if (rows.length === 0) return []
    const scores = await tx.projectEvaluationScore.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        evaluationId: { in: rows.map((row) => row.id) },
      },
      select: scoreDetailSelect,
      orderBy: [{ evaluationId: 'asc' }, { criterionId: 'asc' }],
      take: rows.length * 100,
    })
    return rows.map((row) =>
      mapEvaluationDetail(
        row,
        scores.filter((score) => score.evaluationId === row.id),
      ),
    )
  }

  private async readDetail(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    evaluationId: string,
  ) {
    const evaluation = await tx.projectEvaluation.findFirst({
      where: { organizationId: actor.organizationId, projectId, id: evaluationId },
      select: evaluationDetailSelect,
    })
    if (!evaluation) throw new NotFoundException('Evaluation unavailable.')
    const [detail] = await this.withScores(tx, actor, projectId, [evaluation])
    return detail as NonNullable<typeof detail>
  }

  get(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'monitoring.read', async (tx, actor) => {
      const id = await this.requireProject(tx, actor, projectId)
      const [criteria, evaluations] = await Promise.all([
        tx.projectEvaluationCriterion.findMany({
          where: { organizationId: actor.organizationId, projectId: id, archivedAt: null },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            type: true,
            version: true,
            weightPercentage: true,
            maximumScore: true,
            status: true,
            updatedAt: true,
          },
          orderBy: [{ code: 'asc' }, { version: 'desc' }, { id: 'asc' }],
          take: 101,
        }),
        tx.projectEvaluation.findMany({
          where: { organizationId: actor.organizationId, projectId: id },
          select: evaluationDetailSelect,
          orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }],
          take: maxEvaluations + 1,
        }),
      ])
      if (criteria.length > 100)
        throw new BadRequestException('Narrow the evaluation criteria scope.')
      return {
        projectId: id,
        criteria: criteria.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          type: row.type,
          version: row.version,
          weightPercentage: row.weightPercentage.toString(),
          maximumScore: row.maximumScore.toString(),
          status: row.status,
          updatedAt: row.updatedAt.toISOString(),
        })),
        evaluations: await this.withScores(tx, actor, id, evaluations.slice(0, maxEvaluations)),
        hasMore: evaluations.length > maxEvaluations,
      }
    })
  }

  getAssessmentDetail(identity: ApplicationIdentity, projectId: string, assessmentId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'assessments.detail.read',
      async (tx, actor) => {
        if (assessmentDetailDeniedRoles.has(actor.roles[0]))
          throw new ForbiddenException('Assessment detail is not available to this role.')
        const id = await this.requireProject(tx, actor, projectId)
        const parsed = projectIdSchema.safeParse(assessmentId)
        if (!parsed.success) throw new NotFoundException('Assessment unavailable.')
        const includeBeneficiary = hasAtomicPermission(
          actor.roles[0],
          actor.permissions,
          'beneficiaries.records.read',
        )
        const row = await tx.assessmentResult.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            id: parsed.data,
            project: projectScope(actor),
          },
          select: {
            id: true,
            projectId: true,
            activityId: true,
            enrollmentId: true,
            type: true,
            score: true,
            maximumScore: true,
            assessmentDate: true,
            recordedAt: true,
            ...(includeBeneficiary
              ? {
                  enrollment: {
                    select: {
                      id: true,
                      beneficiary: {
                        select: { id: true, code: true, archivedAt: true },
                      },
                    },
                  },
                }
              : {}),
          },
        })
        if (!row) throw new NotFoundException('Assessment unavailable.')
        const linked = (
          row as {
            enrollment?: {
              beneficiary: { id: string; code: string; archivedAt: Date | null }
            } | null
          }
        ).enrollment?.beneficiary
        const beneficiary =
          includeBeneficiary && linked && !linked.archivedAt
            ? {
                id: linked.id,
                code: linked.code,
              }
            : null
        return {
          id: row.id,
          projectId: row.projectId,
          activityId: row.activityId,
          enrollmentId: includeBeneficiary ? row.enrollmentId : null,
          type: row.type,
          score: row.score.toString(),
          maximumScore: row.maximumScore.toString(),
          assessmentDate: row.assessmentDate.toISOString().slice(0, 10),
          recordedAt: row.recordedAt.toISOString(),
          beneficiary,
        }
      },
    )
  }

  listBeneficiaryAssessments(identity: ApplicationIdentity, projectId: string, query: unknown) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'assessments.detail.read',
      async (tx, actor) => {
        if (assessmentDetailDeniedRoles.has(actor.roles[0]))
          throw new ForbiddenException('Assessment detail is not available to this role.')
        const id = await this.requireProject(tx, actor, projectId)
        const parsed = z.object({ enrollmentId: z.string().uuid() }).safeParse(query)
        if (!parsed.success) throw new NotFoundException('Enrollment unavailable.')
        const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
          where: {
            id: parsed.data.enrollmentId,
            organizationId: actor.organizationId,
            projectId: id,
          },
          select: { id: true },
        })
        if (!enrollment) throw new NotFoundException('Enrollment unavailable.')
        const rows = await tx.assessmentResult.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            enrollmentId: enrollment.id,
            project: projectScope(actor),
          },
          orderBy: [{ assessmentDate: 'asc' }, { id: 'asc' }],
          take: 100,
          select: {
            id: true,
            type: true,
            activityId: true,
            score: true,
            maximumScore: true,
            assessmentDate: true,
            recordedAt: true,
            activity: {
              select: {
                activityJourneyStageMapping_activity: {
                  select: { stageId: true },
                  orderBy: { sequenceOrder: 'asc' },
                  take: 1,
                },
              },
            },
          },
        })
        return rows.map((row) => ({
          id: row.id,
          type: row.type,
          activityId: row.activityId,
          stageId: row.activity?.activityJourneyStageMapping_activity[0]?.stageId ?? null,
          score: row.score.toString(),
          maximumScore: row.maximumScore.toString(),
          assessmentDate: row.assessmentDate.toISOString().slice(0, 10),
          recordedAt: row.recordedAt.toISOString(),
        }))
      },
    )
  }

  configureWeights(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = evaluationWeightsSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException(
        'Supply unique valid criteria with weights totaling 100 percent.',
      )
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.weights.configure',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const rows = await tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>`
        SELECT id::text AS id,updated_at AS "updatedAt" FROM pathways.project_evaluation_criteria
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND status='DRAFT'
          AND archived_at IS NULL ORDER BY id LIMIT 101 FOR UPDATE
      `
        const wanted = new Map(parsed.data.criteria.map((row) => [row.id, row]))
        if (
          rows.length !== wanted.size ||
          rows.some(
            (row) =>
              !wanted.has(row.id) ||
              wanted.get(row.id)?.expectedUpdatedAt !== row.updatedAt.toISOString(),
          )
        )
          throw new ConflictException(
            'Draft criteria changed. Reload the complete draft set before configuring weights.',
          )
        for (const row of rows) {
          const value = wanted.get(row.id)
          if (!value) throw new ConflictException('Criterion unavailable.')
          const changed = await tx.projectEvaluationCriterion.updateMany({
            where: {
              organizationId: actor.organizationId,
              projectId: id,
              id: row.id,
              status: 'DRAFT',
              archivedAt: null,
              updatedAt: row.updatedAt,
            },
            data: { weightPercentage: new Prisma.Decimal(value.weightPercentage) },
          })
          if (changed.count !== 1)
            throw new ConflictException('Draft criterion changed. Reload before retrying.')
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_WEIGHTS_CONFIGURED',
            entityType: 'ProjectEvaluationCriterion',
            entityId: id,
            changes: { criterionIds: rows.map((row) => row.id) },
          },
        })
        return { projectId: id, configured: rows.length }
      },
    )
  }

  // Starts one evaluation round (Mid-term, Final or a custom label) for the project; only
  // one evaluation may be open (DRAFT, SUBMITTED or REVIEWED) at a time, so history stays
  // a simple sequence of closed rounds plus at most one in progress. Retrying the same start
  // returns the round the actor already opened.
  createEvaluation(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = createEvaluationSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('Supply a title and a valid period for the evaluation.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.submit',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`pathways:evaluation-create:${actor.organizationId}:${id}`},0))`
        const open = await tx.projectEvaluation.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            status: { in: ['DRAFT', 'SUBMITTED', 'REVIEWED'] },
          },
          select: {
            id: true,
            title: true,
            periodStart: true,
            periodEnd: true,
            evaluatedById: true,
          },
        })
        if (open) {
          if (
            open.evaluatedById === actor.userId &&
            open.title === parsed.data.title &&
            day(open.periodStart) === parsed.data.periodStart &&
            day(open.periodEnd) === parsed.data.periodEnd
          )
            return this.readDetail(tx, actor, id, open.id)
          throw new ConflictException('An evaluation for this project is already open.')
        }
        const total = await tx.projectEvaluation.count({
          where: { organizationId: actor.organizationId, projectId: id },
        })
        if (total >= maxEvaluations)
          throw new ConflictException(
            `This project already has ${maxEvaluations} evaluations; no more can be started.`,
          )
        const published = await tx.projectEvaluationCriterion.count({
          where: { organizationId: actor.organizationId, projectId: id, status: 'PUBLISHED' },
        })
        if (published === 0)
          throw new ConflictException(
            'Publish the evaluation criteria before starting an evaluation.',
          )
        const created = await tx.projectEvaluation.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            title: parsed.data.title,
            periodLabel: parsed.data.periodLabel ?? null,
            periodStart: new Date(`${parsed.data.periodStart}T00:00:00.000Z`),
            periodEnd: new Date(`${parsed.data.periodEnd}T00:00:00.000Z`),
            evaluatedById: actor.userId,
          },
          select: { id: true },
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_CREATED',
            entityType: 'ProjectEvaluation',
            entityId: created.id,
            changes: {
              title: parsed.data.title,
              periodStart: parsed.data.periodStart,
              periodEnd: parsed.data.periodEnd,
            },
          },
        })
        return this.readDetail(tx, actor, id, created.id)
      },
    )
  }

  // Scores the published criteria: computed types (KPI, Timeline compliance, Budget efficiency,
  // Beneficiary reach) are derived from project data unless not computable, and criterion type
  // OTHER (Relevance, Coherence, Sustainability) always needs a manual score and a note. A
  // computed criterion that cannot be computed falls back to the same manual requirement. Only
  // the rows in the request change: a saved score for a row left out is kept as it is.
  saveScores(
    identity: ApplicationIdentity,
    projectId: string,
    evaluationId: string,
    input: unknown,
  ) {
    const parsed = saveScoresSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('Supply valid scores for the published criteria.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.submit',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const project = await tx.project.findFirst({
          where: { organizationId: actor.organizationId, id },
          select: { id: true, startDate: true, endDate: true, targetBeneficiaries: true },
        })
        if (!project) throw new NotFoundException('Project unavailable.')
        const evaluation = await this.requireEvaluation(tx, actor, id, evaluationId)
        if (evaluation.status !== 'DRAFT')
          throw new ConflictException('Scores may change only while the evaluation is a draft.')
        // The guarded update claims the draft revision, so a concurrent save or submit fails.
        const claimed = await tx.projectEvaluation.updateMany({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            id: evaluationId,
            status: 'DRAFT',
            updatedAt: new Date(parsed.data.expectedUpdatedAt),
          },
          data: {
            updatedAt: new Date(),
            ...(parsed.data.commentary !== undefined ? { commentary: parsed.data.commentary } : {}),
          },
        })
        if (claimed.count !== 1)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        const criteria = await tx.projectEvaluationCriterion.findMany({
          where: { organizationId: actor.organizationId, projectId: id, status: 'PUBLISHED' },
          select: { id: true, type: true, maximumScore: true },
        })
        if (criteria.length === 0)
          throw new ConflictException('Publish the evaluation criteria before scoring.')
        const saved = new Set(
          (
            await tx.projectEvaluationScore.findMany({
              where: { organizationId: actor.organizationId, projectId: id, evaluationId },
              select: { criterionId: true },
              take: 101,
            })
          ).map((row) => row.criterionId),
        )
        const supplied = new Map(parsed.data.scores.map((row) => [row.criterionId, row]))
        const pending = criteria.filter((row) => supplied.has(row.id) || !saved.has(row.id))
        // Computed once for every computed criterion together, not once per criterion: KPI
        // achievement is read from the database at most once even when both a KPI criterion and
        // a Budget efficiency criterion (which reuses it) are present.
        const computedScores = await this.metrics.computeMany(
          tx,
          actor,
          project,
          day(evaluation.periodEnd),
          pending
            .filter((row) => isComputedCriterionType(row.type))
            .map((row) => ({
              id: row.id,
              type: row.type,
              maximumScore: row.maximumScore.toString(),
            })) as { id: string; type: ComputedCriterionType; maximumScore: string }[],
        )
        const writes: Array<{
          criterionId: string
          maximumScore: Prisma.Decimal
          score: string
          commentary: string
        }> = []
        const missing: Array<{ fieldCode: string; code: string; message: string }> = []
        for (const criterion of pending) {
          const manual = supplied.get(criterion.id)
          let score: string
          let commentary: string
          if (isComputedCriterionType(criterion.type)) {
            const computed = computedScores.get(criterion.id)
            if (!computed) throw new BadRequestException('Criterion is unavailable.')
            if (computed.score !== null) {
              score = computed.score
              commentary = computed.commentary
            } else if (manual?.manualScore !== undefined && manual.note) {
              score = manual.manualScore.toFixed(4)
              commentary = `${computed.commentary}${manualMarker}${manual.note}`
            } else {
              missing.push({
                fieldCode: criterion.id,
                code: 'NOT_COMPUTABLE',
                message: computed.commentary.slice(0, 300),
              })
              continue
            }
          } else {
            if (manual?.manualScore === undefined || !manual.note) {
              missing.push({
                fieldCode: criterion.id,
                code: 'MANUAL_REQUIRED',
                message: 'Enter a score and a note explaining the judgment.',
              })
              continue
            }
            score = manual.manualScore.toFixed(4)
            commentary = manual.note
          }
          if (Number(score) > Number(criterion.maximumScore))
            throw new BadRequestException('A score cannot exceed its criterion maximum.')
          writes.push({
            criterionId: criterion.id,
            maximumScore: criterion.maximumScore,
            score,
            commentary,
          })
        }
        if (missing.length)
          throw new BadRequestException({
            message: 'Some criteria need a manual score and a note.',
            errors: missing,
          })
        for (const row of writes)
          await tx.projectEvaluationScore.upsert({
            where: {
              organizationId_projectId_evaluationId_criterionId: {
                organizationId: actor.organizationId,
                projectId: id,
                evaluationId,
                criterionId: row.criterionId,
              },
            },
            update: { score: row.score, commentary: row.commentary },
            create: {
              organizationId: actor.organizationId,
              projectId: id,
              evaluationId,
              criterionId: row.criterionId,
              score: row.score,
              maximumScore: row.maximumScore,
              weightedScore: 0,
              criterionSnapshot: {},
              commentary: row.commentary,
            },
          })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_SCORES_SAVED',
            entityType: 'ProjectEvaluation',
            entityId: evaluationId,
            changes: { criterionIds: writes.map((row) => row.criterionId) },
          },
        })
        return this.readDetail(tx, actor, id, evaluationId)
      },
    )
  }

  submit(identity: ApplicationIdentity, projectId: string, evaluationId: string, input: unknown) {
    const parsed = submitEvaluationSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Supply the evaluation you last loaded.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.submit',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const evaluation = await this.requireEvaluation(tx, actor, id, evaluationId)
        if (evaluation.status !== 'DRAFT')
          throw new ConflictException('This evaluation changed; reload before retrying.')
        if (evaluation.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        const criteriaCount = await tx.projectEvaluationCriterion.count({
          where: { organizationId: actor.organizationId, projectId: id, status: 'PUBLISHED' },
        })
        const scoreCount = await tx.projectEvaluationScore.count({
          where: { organizationId: actor.organizationId, projectId: id, evaluationId },
        })
        if (criteriaCount === 0 || scoreCount !== criteriaCount)
          throw new BadRequestException(
            'Every published criterion needs a score before submitting.',
          )
        const now = new Date()
        const changed = await tx.projectEvaluation.updateMany({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            id: evaluationId,
            status: 'DRAFT',
            updatedAt: evaluation.updatedAt,
          },
          data: {
            status: 'SUBMITTED',
            evaluatedById: actor.userId,
            evaluatedAt: now,
            updatedAt: now,
          },
        })
        if (changed.count !== 1)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_SUBMITTED',
            entityType: 'ProjectEvaluation',
            entityId: evaluationId,
            changes: {},
          },
        })
        return this.readDetail(tx, actor, id, evaluationId)
      },
    )
  }

  // Project Manager returns a submitted evaluation for correction; the reason is recorded as
  // the evaluation's return reason (never its narrative commentary), shown to the Monitoring and
  // Evaluation Officer on the reopened draft. Scores and criterion snapshots are untouched.
  returnToDraft(
    identity: ApplicationIdentity,
    projectId: string,
    evaluationId: string,
    input: unknown,
  ) {
    const parsed = returnEvaluationSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('Supply a reason for returning this evaluation.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.approve',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const evaluation = await this.requireEvaluation(tx, actor, id, evaluationId)
        if (evaluation.status !== 'SUBMITTED')
          throw new ConflictException('This evaluation changed; reload before retrying.')
        if (evaluation.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        const now = new Date()
        const changed = await tx.projectEvaluation.updateMany({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            id: evaluationId,
            status: 'SUBMITTED',
            updatedAt: evaluation.updatedAt,
          },
          data: {
            status: 'DRAFT',
            evaluatedAt: null,
            overallScore: null,
            returnReason: parsed.data.reason,
            updatedAt: now,
          },
        })
        if (changed.count !== 1)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_RETURNED',
            entityType: 'ProjectEvaluation',
            entityId: evaluationId,
            changes: { reason: parsed.data.reason },
          },
        })
        return this.readDetail(tx, actor, id, evaluationId)
      },
    )
  }

  // Project Manager reviews and signs off in one action: two transitions (SUBMITTED ->
  // REVIEWED -> SIGNED_OFF) in the same transaction, both attributed to the same reviewer.
  // The evaluator cannot sign off their own evaluation even though the two roles never
  // overlap today (one role per user), kept as a direct, defense-in-depth check.
  signoff(identity: ApplicationIdentity, projectId: string, evaluationId: string, input: unknown) {
    const parsed = signoffEvaluationSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('Supply sign-off feedback for this evaluation.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.approve',
      async (tx, actor) => {
        if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'evaluations.signoff'))
          throw new ForbiddenException('Sign-off is unavailable for your role.')
        const id = await this.requireProject(tx, actor, projectId)
        const evaluation = await this.requireEvaluation(tx, actor, id, evaluationId)
        if (evaluation.status !== 'SUBMITTED')
          throw new ConflictException('This evaluation changed; reload before retrying.')
        if (evaluation.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        if (evaluation.evaluatedById === actor.userId)
          throw new ForbiddenException('The evaluator cannot sign off their own evaluation.')
        const reviewedAt = new Date()
        const reviewed = await tx.projectEvaluation.updateMany({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            id: evaluationId,
            status: 'SUBMITTED',
            updatedAt: evaluation.updatedAt,
          },
          data: {
            status: 'REVIEWED',
            reviewedById: actor.userId,
            reviewedAt,
            reviewFeedback: parsed.data.feedback,
            updatedAt: reviewedAt,
          },
        })
        if (reviewed.count !== 1)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        const signedOffAt = new Date()
        const signed = await tx.projectEvaluation.updateMany({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            id: evaluationId,
            status: 'REVIEWED',
            updatedAt: reviewedAt,
          },
          data: {
            status: 'SIGNED_OFF',
            signedOffById: actor.userId,
            signedOffAt,
            updatedAt: signedOffAt,
          },
        })
        if (signed.count !== 1)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_REVIEWED',
            entityType: 'ProjectEvaluation',
            entityId: evaluationId,
            changes: { feedback: parsed.data.feedback },
          },
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_SIGNED_OFF',
            entityType: 'ProjectEvaluation',
            entityId: evaluationId,
            changes: {},
          },
        })
        return this.readDetail(tx, actor, id, evaluationId)
      },
    )
  }
}
