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

const projectIdSchema = z.string().uuid()
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

@Injectable()
export class EvaluationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
        const hash = createHash('sha256')
          .update(JSON.stringify({ projectId: id, criteria: body.criteria }))
          .digest('hex')
        await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`pathways:criterion-initialize:${actor.organizationId}:${id}`},0))`
        await this.requireProject(tx, actor, id)
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
          if (receipt.projectId !== id || !saved.success || saved.data.requestHash !== hash)
            throw new ConflictException('Criterion request already used with different content.')
          return { criteria: saved.data.criteria }
        }
        const existing = await tx.projectEvaluationCriterion.findMany({
          where: { organizationId: actor.organizationId, projectId: id },
          select: { id: true },
          take: 101,
        })
        if (existing.length) throw new ConflictException('Project criteria already initialized.')
        const criteria = []
        for (const row of body.criteria) {
          const created = await tx.projectEvaluationCriterion.create({
            data: {
              organizationId: actor.organizationId,
              projectId: id,
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
            projectId: id,
            actorUserId: actor.userId,
            action: 'EVALUATION_CRITERIA_INITIALIZED',
            entityType: 'ProjectEvaluationCriterionSet',
            entityId: body.clientRequestId,
            changes: { requestHash: hash, criteria },
          },
        })
        return { criteria }
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

  get(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'monitoring.read', async (tx, actor) => {
      const id = await this.requireProject(tx, actor, projectId)
      const [evaluation, criteria] = await Promise.all([
        tx.projectEvaluation.findFirst({
          where: { organizationId: actor.organizationId, projectId: id },
          select: {
            id: true,
            title: true,
            periodStart: true,
            periodEnd: true,
            overallScore: true,
            status: true,
          },
          orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }],
        }),
        tx.projectEvaluationCriterion.findMany({
          where: { organizationId: actor.organizationId, projectId: id, archivedAt: null },
          select: {
            id: true,
            code: true,
            name: true,
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
      ])
      if (criteria.length > 100)
        throw new BadRequestException('Narrow the evaluation criteria scope.')
      return {
        projectId: id,
        evaluation: evaluation
          ? {
              ...evaluation,
              overallScore: evaluation.overallScore?.toString() ?? null,
              periodStart: evaluation.periodStart.toISOString().slice(0, 10),
              periodEnd: evaluation.periodEnd.toISOString().slice(0, 10),
            }
          : null,
        criteria: criteria.map((row) => ({
          ...row,
          weightPercentage: row.weightPercentage.toString(),
          maximumScore: row.maximumScore.toString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      }
    })
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
}
