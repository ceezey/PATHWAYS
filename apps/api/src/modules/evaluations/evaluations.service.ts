import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import {
  createEvaluationRequest,
  hasAtomicPermission,
  returnEvaluationRequest,
  saveEvaluationScoresRequest,
  signOffEvaluationRequest,
  submitEvaluationRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'
import { listEnrollmentAssessments, readAssessmentDetail } from './evaluation-assessments.service'
import { provisionCriteria } from './evaluation-criteria-template'
import { readDetail, requireEvaluation, withScores } from './evaluation-detail.service'
import { EvaluationMetricsService } from './evaluation-metrics.service'
import { returnEvaluation, signOffEvaluation } from './evaluation-review.service'
import { scoreRound } from './evaluation-scoring.service'
import { day } from './evaluations.helpers'
import { evaluationDetailSelect } from './evaluations.mapper'

const maxEvaluations = 20

@Injectable()
export class EvaluationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvaluationMetricsService) private readonly metrics: EvaluationMetricsService,
  ) {}

  get(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'monitoring.read', async (tx, actor) => {
      const id = await requireScopedProject(tx, actor, projectId)
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
        evaluations: await withScores(tx, actor, id, evaluations.slice(0, maxEvaluations)),
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
        return readAssessmentDetail(tx, actor, projectId, assessmentId)
      },
    )
  }

  listBeneficiaryAssessments(identity: ApplicationIdentity, projectId: string, query: unknown) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'assessments.detail.read',
      async (tx, actor) => {
        return listEnrollmentAssessments(tx, actor, projectId, query)
      },
    )
  }

  // Starts one evaluation round (Mid-term, Final or a custom label) for the project and scores
  // it automatically; only one evaluation may be open (DRAFT, SUBMITTED or REVIEWED) at a time,
  // so history stays a simple sequence of closed rounds plus at most one in progress. The first
  // round also provisions the default criteria. Retrying the same start returns the round the
  // actor already opened.
  createEvaluation(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = createEvaluationRequest.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('Supply a title and a valid period for the evaluation.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.submit',
      async (tx, actor) => {
        const id = await requireScopedProject(tx, actor, projectId)
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
            return readDetail(tx, actor, id, open.id)
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
        await scoreRound(this.metrics, tx, actor, id, created.id, {
          start: periodStart,
          end: periodEnd,
        })
        await writeAuditLog(tx, actor, {
          projectId: id,
          action: 'EVALUATION_CREATED',
          entityType: 'ProjectEvaluation',
          entityId: created.id,
          changes: {
            title: parsed.data.title,
            periodStart: parsed.data.periodStart,
            periodEnd: parsed.data.periodEnd,
          },
        })
        return readDetail(tx, actor, id, created.id)
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
    const parsed = saveEvaluationScoresRequest.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Supply the evaluation you last loaded.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.submit',
      async (tx, actor) => {
        const id = await requireScopedProject(tx, actor, projectId)
        const evaluation = await requireEvaluation(tx, actor, id, evaluationId)
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
        const count = await scoreRound(this.metrics, tx, actor, id, evaluationId, {
          start: evaluation.periodStart,
          end: evaluation.periodEnd,
        })
        await writeAuditLog(tx, actor, {
          projectId: id,
          action: 'EVALUATION_SCORES_SAVED',
          entityType: 'ProjectEvaluation',
          entityId: evaluationId,
          changes: { criteriaScored: count },
        })
        return readDetail(tx, actor, id, evaluationId)
      },
    )
  }

  submit(identity: ApplicationIdentity, projectId: string, evaluationId: string, input: unknown) {
    const parsed = submitEvaluationRequest.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Supply the evaluation you last loaded.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.submit',
      async (tx, actor) => {
        const id = await requireScopedProject(tx, actor, projectId)
        const evaluation = await requireEvaluation(tx, actor, id, evaluationId)
        if (evaluation.status !== 'DRAFT')
          throw new ConflictException('This evaluation changed; reload before retrying.')
        if (evaluation.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt)
          throw new ConflictException('This evaluation changed; reload before retrying.')
        // Scores are refreshed at submission so the submitted figures match the project data now.
        await scoreRound(this.metrics, tx, actor, id, evaluationId, {
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
        await writeAuditLog(tx, actor, {
          projectId: id,
          action: 'EVALUATION_SUBMITTED',
          entityType: 'ProjectEvaluation',
          entityId: evaluationId,
          changes: {},
        })
        return readDetail(tx, actor, id, evaluationId)
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
    const parsed = returnEvaluationRequest.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('Supply a reason for returning this evaluation.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.approve',
      async (tx, actor) => {
        return returnEvaluation(tx, actor, projectId, evaluationId, parsed.data)
      },
    )
  }

  // Project Manager reviews and signs off in one action: two transitions (SUBMITTED ->
  // REVIEWED -> SIGNED_OFF) in the same transaction, both attributed to the same reviewer.
  // The evaluator cannot sign off their own evaluation even though the two roles never
  // overlap today (one role per user), kept as a direct, defense-in-depth check.
  signoff(identity: ApplicationIdentity, projectId: string, evaluationId: string, input: unknown) {
    const parsed = signOffEvaluationRequest.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('Supply sign-off feedback for this evaluation.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'evaluations.approve',
      async (tx, actor) => {
        return signOffEvaluation(tx, actor, projectId, evaluationId, parsed.data)
      },
    )
  }
}
