import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { provisionCriteria } from './evaluation-criteria-template'
import { EvaluationMetricsService, classifyScoreCommentary } from './evaluation-metrics'

const projectIdSchema = z.string().uuid()
// Locked auth RFC: System Administrator is denied assessment/survey detail and
// Program/Grant Managers are aggregate-only, independent of any stored grant.
const assessmentDetailDeniedRoles = new Set([
  'SYSTEM_ADMINISTRATOR',
  'PROGRAM_MANAGER',
  'GRANT_MANAGER',
])
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).valueOf()))
const createEvaluationSchema = z
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
export const saveScoresSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    commentary: z.string().trim().max(4000).optional(),
  })
  .strict()
const submitEvaluationSchema = z
  .object({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
  .strict()
const returnEvaluationSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()
const signoffEvaluationSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    feedback: z.string().trim().min(1).max(2000),
  })
  .strict()

const person = { select: { id: true, fullName: true } } as const
const named = (value: { id: string; fullName: string } | null) =>
  value ? { id: value.id, name: value.fullName.slice(0, 200) } : null
const day = (value: Date) => value.toISOString().slice(0, 10)

const maxEvaluations = 20
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
  const view = classifyScoreCommentary(score.commentary, criterion.type)
  return {
    criterionId: score.criterionId,
    score: score.score.toString(),
    maximumScore: score.maximumScore.toString(),
    weightedScore: score.weightedScore.toString(),
    ...view,
    criterion,
  }
}

@Injectable()
export class EvaluationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvaluationMetricsService) private readonly metrics: EvaluationMetricsService,
  ) {}

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
      select: {
        id: true,
        status: true,
        updatedAt: true,
        evaluatedById: true,
        periodStart: true,
        periodEnd: true,
      },
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
        if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read'))
          throw new ForbiddenException('Assessment detail is not available to this role.')
        const id = await this.requireProject(tx, actor, projectId)
        const parsed = z.object({ enrollmentId: z.string().uuid() }).safeParse(query)
        if (!parsed.success) throw new NotFoundException('Enrollment unavailable.')
        const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
          where: {
            id: parsed.data.enrollmentId,
            organizationId: actor.organizationId,
            projectId: id,
            beneficiary: { organizationId: actor.organizationId, archivedAt: null },
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
                  orderBy: [{ sequenceOrder: 'asc' }, { stageId: 'asc' }],
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

  // Computes and stores one score per published criterion from the project's own data; the
  // database fills the snapshot, maximum and weighted score. Shared by start, recompute and submit.
  private async scoreRound(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    evaluationId: string,
    period: { start: Date; end: Date },
  ) {
    const scope = { organizationId: actor.organizationId, projectId }
    const project = await tx.project.findFirst({
      where: { organizationId: actor.organizationId, id: projectId },
      select: { id: true, targetBeneficiaries: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    const criteria = await tx.projectEvaluationCriterion.findMany({
      where: { ...scope, status: 'PUBLISHED' },
      select: { id: true, type: true, maximumScore: true },
    })
    if (criteria.length === 0)
      throw new ConflictException('The evaluation criteria are not ready for this project.')
    const computed = await this.metrics.computeMany(
      tx,
      actor,
      project,
      { start: day(period.start), end: day(period.end) },
      criteria.map((row) => ({ ...row, maximumScore: row.maximumScore.toString() })),
    )
    for (const row of criteria) {
      const result = computed.get(row.id)
      if (!result) throw new BadRequestException('Criterion is unavailable.')
      await tx.projectEvaluationScore.upsert({
        where: {
          organizationId_projectId_evaluationId_criterionId: {
            ...scope,
            evaluationId,
            criterionId: row.id,
          },
        },
        update: { score: result.score, commentary: result.commentary },
        create: {
          ...scope,
          evaluationId,
          criterionId: row.id,
          score: result.score,
          maximumScore: row.maximumScore,
          weightedScore: 0,
          criterionSnapshot: {},
          commentary: result.commentary,
        },
      })
    }
    return criteria.length
  }

  // Starts one evaluation round (Mid-term, Final or a custom label) for the project and scores
  // it automatically; only one evaluation may be open (DRAFT, SUBMITTED or REVIEWED) at a time,
  // so history stays a simple sequence of closed rounds plus at most one in progress. The first
  // round also provisions the default criteria. Retrying the same start returns the round the
  // actor already opened.
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
        if (hasAtomicPermission(actor.roles[0], actor.permissions, 'evaluations.weights.configure'))
          await provisionCriteria(tx, actor, id)
        const periodStart = new Date(`${parsed.data.periodStart}T00:00:00.000Z`)
        const periodEnd = new Date(`${parsed.data.periodEnd}T00:00:00.000Z`)
        const created = await tx.projectEvaluation.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            title: parsed.data.title,
            periodLabel: parsed.data.periodLabel ?? null,
            periodStart,
            periodEnd,
            evaluatedById: actor.userId,
          },
          select: { id: true },
        })
        await this.scoreRound(tx, actor, id, created.id, { start: periodStart, end: periodEnd })
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

  // Recomputes every score from current project data while the round is a draft and optionally
  // saves the narrative; there are no manual scores.
  saveScores(
    identity: ApplicationIdentity,
    projectId: string,
    evaluationId: string,
    input: unknown,
  ) {
    const parsed = saveScoresSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Supply the evaluation you last loaded.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.submit',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
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
        const count = await this.scoreRound(tx, actor, id, evaluationId, {
          start: evaluation.periodStart,
          end: evaluation.periodEnd,
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_SCORES_SAVED',
            entityType: 'ProjectEvaluation',
            entityId: evaluationId,
            changes: { criteriaScored: count },
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
        // Scores are refreshed at submission so the submitted figures match the project data now.
        await this.scoreRound(tx, actor, id, evaluationId, {
          start: evaluation.periodStart,
          end: evaluation.periodEnd,
        })
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
