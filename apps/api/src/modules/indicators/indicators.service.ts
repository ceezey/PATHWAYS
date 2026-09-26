import { createHash, randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type CreateIndicatorInput,
  type ManualMeasurementInput,
  type MonitoringIndicator,
  P06_CONTRACT_VERSION,
  type ProjectIndicator,
  type UpdateIndicatorInput,
  compareProgressToTargetGoal,
  indicatorProgress,
  missingMetric,
  monitoringIndicatorSchema,
  normalizeMetricDecimal,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import {
  createIndicatorSchema,
  manualMeasurementSchema,
  parseIndicatorInput,
  updateIndicatorSchema,
} from './indicators.dto'

type Tx = Prisma.TransactionClient
type DefinitionRow = Omit<MonitoringIndicator, 'progress' | 'contractVersion'> & {
  projectTargetGoal: string | null
}

export function monitoringSqlError(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : null
  const sqlCode = meta && typeof meta === 'object' && 'code' in meta ? meta.code : null
  if (
    code === 'P2002' ||
    code === 'P2034' ||
    ['23505', '23514', '40001', '40P01'].includes(String(sqlCode))
  ) {
    throw new ConflictException(
      'The indicator or measurement changed, conflicts, or violates its contract. Reload before retrying.',
    )
  }
  if (sqlCode === '42501') throw new ForbiddenException('Monitoring scope is unavailable.')
  if (code === 'P2028' || ['57014', '42P01', '42703', '42883', '22023'].includes(String(sqlCode))) {
    throw new ServiceUnavailableException(
      'Monitoring verification is unavailable or exceeded its query limit.',
    )
  }
  throw error
}

@Injectable()
export class IndicatorsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async requireProject(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project.id
  }
  private indicatorId(input: string) {
    if (!UUID_PATTERN.test(input)) throw new NotFoundException('Indicator unavailable.')
    return input.toLowerCase()
  }

  /** Called only inside a current authorized transaction with server-derived scope. */
  private async readProjectIndicatorsInTransaction(
    tx: Tx,
    actor: ApplicationIdentity,
    projectIds: string[],
    options: { indicatorId?: string; periodStart?: string; periodEnd?: string } = {},
  ): Promise<ProjectIndicator[]> {
    if (projectIds.length === 0) return []
    if (projectIds.length > 100 || projectIds.some((id) => !UUID_PATTERN.test(id)))
      throw new BadRequestException('Narrow the monitoring project scope.')
    const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
    await tx.$queryRaw`SELECT set_config('statement_timeout','3000',true)`
    let rows: DefinitionRow[]
    try {
      rows = await tx.$queryRaw<DefinitionRow[]>(Prisma.sql`
        SELECT i.id::text AS id,i.project_id::text AS "projectId",i.code,i.name,i.description,
          trim_scale(p.target_goal)::text AS "projectTargetGoal",
          i.unit_label AS "unitLabel",i.data_source AS "dataSource",i.measurement_mode AS mode,i.numeric_kind AS "numericKind",i.direction,
          i.display_precision AS "displayPrecision",to_char(i.period_start,'YYYY-MM-DD') AS "periodStart",to_char(i.period_end,'YYYY-MM-DD') AS "periodEnd",
          trim_scale(i.baseline_value)::text AS baseline,trim_scale(i.target_value)::text AS target,
          computed.payload->'current' AS current,computed.payload->>'measurementId' AS "measurementId",computed.payload->>'measuredAt' AS "measuredAt",computed.payload->>'measurementSource' AS "measurementSource",
          CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_strip_nulls(jsonb_build_object('recipe',b.recipe,'activityId',b.activity_id,'formId',b.form_id,'formVersion',b.form_version,'fieldId',b.field_id)) END AS binding,
          i.revision,CASE WHEN i.archived_at IS NOT NULL THEN 'ARCHIVED' WHEN i.measurement_mode IS NULL THEN 'LEGACY_REVIEW_REQUIRED' ELSE 'ACTIVE' END AS status
        FROM pathways.project_indicators i
        JOIN pathways.projects p ON p.organization_id=i.organization_id AND p.id=i.project_id
        LEFT JOIN pathways.project_indicator_bindings b ON b.organization_id=i.organization_id AND b.project_id=i.project_id AND b.indicator_id=i.id
        CROSS JOIN LATERAL (SELECT pathways.p06_indicator_value(${actor.organizationId}::uuid,i.project_id,i.id,${zone}) AS payload) computed
        WHERE i.organization_id=${actor.organizationId}::uuid AND i.project_id IN (${Prisma.join(projectIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND (${options.indicatorId ?? null}::uuid IS NULL OR i.id=${options.indicatorId ?? null}::uuid)
          AND (${options.indicatorId ?? null}::uuid IS NOT NULL OR i.archived_at IS NULL)
          AND (${options.periodStart ?? null}::date IS NULL OR (i.period_start=${options.periodStart ?? null}::date AND i.period_end=${options.periodEnd ?? null}::date))
        ORDER BY i.code,i.id LIMIT 101
      `)
    } catch (error) {
      monitoringSqlError(error)
    }
    if (rows.length > 100)
      throw new BadRequestException(
        'More than 100 indicator definitions match; narrow the project scope.',
      )
    return rows.map((row) => {
      const { projectTargetGoal, ...definition } = row
      const parsed = monitoringIndicatorSchema.safeParse({
        ...definition,
        progress: missingMetric('NOT_YET_CALCULATED'),
        contractVersion: P06_CONTRACT_VERSION,
      })
      if (!parsed.success)
        throw new ServiceUnavailableException('Stored indicator contract is unavailable.')
      const indicator = parsed.data
      const progress = indicator.direction
        ? indicatorProgress(
            indicator.current,
            indicator.baseline,
            indicator.target,
            indicator.direction,
          )
        : missingMetric('LEGACY_REVIEW_REQUIRED')
      return {
        ...indicator,
        progress,
        projectGoalComparison: compareProgressToTargetGoal(progress, projectTargetGoal),
      }
    })
  }

  async readInTransaction(
    tx: Tx,
    actor: ApplicationIdentity,
    projectIds: string[],
    options: { indicatorId?: string; periodStart?: string; periodEnd?: string } = {},
  ): Promise<MonitoringIndicator[]> {
    const projectIndicators = await this.readProjectIndicatorsInTransaction(
      tx,
      actor,
      projectIds,
      options,
    )
    return projectIndicators.map(
      ({ projectGoalComparison: _projectGoalComparison, ...indicator }) => indicator,
    )
  }

  private async readOne(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    indicatorId: string,
  ) {
    const [row] = await this.readProjectIndicatorsInTransaction(tx, actor, [projectId], {
      indicatorId,
    })
    if (!row) throw new NotFoundException('Indicator unavailable.')
    return row
  }
  list(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'monitoring.read', async (tx, actor) =>
      this.readProjectIndicatorsInTransaction(tx, actor, [
        await this.requireProject(tx, actor, projectId),
      ]),
    )
  }
  get(identity: ApplicationIdentity, projectId: string, indicatorId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'monitoring.read', async (tx, actor) =>
      this.readOne(
        tx,
        actor,
        await this.requireProject(tx, actor, projectId),
        this.indicatorId(indicatorId),
      ),
    )
  }
  private audit(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    action: string,
    entityId: string,
    changes: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        projectId,
        action,
        entityType: 'ProjectIndicator',
        entityId,
        changes,
      },
    })
  }
  private async validateBinding(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    input: CreateIndicatorInput,
  ) {
    const binding = input.binding
    if (!binding) return
    if (binding.activityId) {
      const activity = await tx.projectActivity.findFirst({
        where: {
          id: binding.activityId,
          organizationId: actor.organizationId,
          projectId,
          archivedAt: null,
          status: { not: 'CANCELLED' },
        },
        select: { id: true },
      })
      if (!activity) throw new NotFoundException('Bound activity unavailable.')
    }
    if (binding.formId) {
      const form = await tx.digitalForm.findFirst({
        where: {
          id: binding.formId,
          organizationId: actor.organizationId,
          projectId,
          version: binding.formVersion,
          status: 'PUBLISHED',
          archivedAt: null,
        },
        select: { id: true },
      })
      if (!form) throw new NotFoundException('Published form version unavailable.')
      const field = await tx.formField.findFirst({
        where: {
          id: binding.fieldId,
          organizationId: actor.organizationId,
          projectId,
          formId: form.id,
          dataType: { in: ['INTEGER', 'DECIMAL'] },
        },
        select: { id: true },
      })
      if (!field) throw new NotFoundException('Numeric form field unavailable.')
    }
  }
  async create(identity: ApplicationIdentity, projectId: string, value: unknown) {
    const input: CreateIndicatorInput = parseIndicatorInput(createIndicatorSchema, value)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.create',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        await tx.$queryRaw`SELECT id FROM pathways.projects WHERE organization_id=${actor.organizationId}::uuid AND id=${id}::uuid FOR UPDATE`
        await this.validateBinding(tx, actor, id, input)
        const [size] = await tx.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pathways.project_indicators WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND archived_at IS NULL`
        if (size && size.count >= 100n)
          throw new ConflictException(
            'Archive unused indicators before adding more than 100 active definitions.',
          )
        const indicatorId = randomUUID()
        const baseline =
          input.baseline === null ? null : normalizeMetricDecimal(input.baseline, input.numericKind)
        const target =
          input.target === null ? null : normalizeMetricDecimal(input.target, input.numericKind)
        const unit =
          input.numericKind === 'COUNT'
            ? 'COUNT'
            : input.numericKind === 'PERCENTAGE'
              ? 'PERCENTAGE'
              : 'OTHER'
        try {
          await tx.$executeRaw`
          INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,description,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
          VALUES (${indicatorId}::uuid,${actor.organizationId}::uuid,${id}::uuid,${input.code},${input.name},${input.description ?? null},${unit}::pathways.indicator_unit,${input.unitLabel},${input.dataSource},${input.mode},${input.numericKind},${input.direction},${input.displayPrecision},${input.periodStart}::date,${input.periodEnd}::date,${baseline}::numeric,${target}::numeric,${actor.userId}::uuid)
        `
          if (input.binding) {
            const b = input.binding
            await tx.$executeRaw`
            INSERT INTO pathways.project_indicator_bindings(organization_id,project_id,indicator_id,recipe,activity_id,form_id,form_version,field_id,created_by_id)
            VALUES (${actor.organizationId}::uuid,${id}::uuid,${indicatorId}::uuid,${b.recipe},${b.activityId ?? null}::uuid,${b.formId ?? null}::uuid,${b.formVersion ?? null},${b.fieldId ?? null}::uuid,${actor.userId}::uuid)
          `
          }
          await this.audit(tx, actor, id, 'PROJECT_INDICATOR_CREATED', indicatorId, {
            mode: input.mode,
            numericKind: input.numericKind,
            recipe: input.binding?.recipe ?? null,
            contractVersion: P06_CONTRACT_VERSION,
          })
        } catch (error) {
          monitoringSqlError(error)
        }
        return this.readOne(tx, actor, id, indicatorId)
      },
    )
  }
  async update(
    identity: ApplicationIdentity,
    projectId: string,
    indicatorId: string,
    value: unknown,
  ) {
    const input: UpdateIndicatorInput = parseIndicatorInput(updateIndicatorSchema, value)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.update',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const selected = this.indicatorId(indicatorId)
        try {
          const count =
            await tx.$executeRaw`UPDATE pathways.project_indicators SET name=${input.name},description=${input.description ?? null},revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND id=${selected}::uuid AND revision=${input.expectedRevision} AND archived_at IS NULL`
          if (count !== 1)
            throw new ConflictException(
              'Indicator changed or is unavailable. Reload before editing.',
            )
          await this.audit(tx, actor, id, 'PROJECT_INDICATOR_LABEL_UPDATED', selected, {
            revision: input.expectedRevision + 1,
          })
        } catch (error) {
          monitoringSqlError(error)
        }
        return this.readOne(tx, actor, id, selected)
      },
    )
  }
  archive(
    identity: ApplicationIdentity,
    projectId: string,
    indicatorId: string,
    expectedRevision: number,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.update',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const selected = this.indicatorId(indicatorId)
        try {
          const count =
            await tx.$executeRaw`UPDATE pathways.project_indicators SET archived_at=CURRENT_TIMESTAMP,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND id=${selected}::uuid AND revision=${expectedRevision} AND archived_at IS NULL`
          if (count !== 1)
            throw new ConflictException(
              'Indicator changed or is unavailable. Reload before archiving.',
            )
          await this.audit(tx, actor, id, 'PROJECT_INDICATOR_ARCHIVED', selected, {
            revision: expectedRevision + 1,
          })
        } catch (error) {
          monitoringSqlError(error)
        }
        return this.readOne(tx, actor, id, selected)
      },
    )
  }
  async measure(
    identity: ApplicationIdentity,
    projectId: string,
    indicatorId: string,
    value: unknown,
  ) {
    const input: ManualMeasurementInput = parseIndicatorInput(manualMeasurementSchema, value)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.update',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const selected = this.indicatorId(indicatorId)
        await tx.$queryRaw`SELECT id FROM pathways.project_indicators WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND id=${selected}::uuid FOR UPDATE`
        const definition = await this.readOne(tx, actor, id, selected)
        if (definition.mode !== 'MANUAL' || !definition.numericKind)
          throw new ConflictException('Manual measurements require a reviewed manual definition.')
        if (
          definition.periodStart !== input.periodStart ||
          definition.periodEnd !== input.periodEnd
        )
          throw new ConflictException('The measurement must use its definition reporting period.')
        let exact: string
        try {
          exact = normalizeMetricDecimal(input.value, definition.numericKind)
        } catch {
          throw new BadRequestException('Measurement does not match the indicator numeric domain.')
        }
        const requestHash = createHash('sha256')
          .update(
            JSON.stringify({
              projectId: id,
              indicatorId: selected,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              value: exact,
              source: input.source,
              note: input.note ?? null,
              correctsMeasurementId: input.correctsMeasurementId ?? null,
              correctionReason: input.correctionReason ?? null,
            }),
          )
          .digest('hex')
        const [retry] = await tx.$queryRaw<
          Array<{ hash: string }>
        >`SELECT request_hash AS hash FROM pathways.project_indicator_measurements WHERE organization_id=${actor.organizationId}::uuid AND recorded_by_id=${actor.userId}::uuid AND client_measurement_id=${input.clientMeasurementId}::uuid`
        if (retry) {
          if (retry.hash !== requestHash)
            throw new ConflictException('The idempotency key was already used for different input.')
          return definition
        }
        if (definition.status === 'ARCHIVED')
          throw new ConflictException('Archived indicators do not accept measurements.')
        if (definition.measurementId !== (input.correctsMeasurementId ?? null))
          throw new ConflictException(
            'Correct the latest measurement with a reason, or reload before creating the first value.',
          )
        const measurementId = randomUUID()
        try {
          await tx.$executeRaw`
          INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,note,client_measurement_id,request_hash,corrects_measurement_id,correction_reason,recorded_by_id)
          VALUES (${measurementId}::uuid,${actor.organizationId}::uuid,${id}::uuid,${selected}::uuid,${input.periodStart}::date,${input.periodEnd}::date,${exact}::numeric,${input.source},${input.note ?? null},${input.clientMeasurementId}::uuid,${requestHash},${input.correctsMeasurementId ?? null}::uuid,${input.correctionReason ?? null},${actor.userId}::uuid)
        `
          await this.audit(
            tx,
            actor,
            id,
            input.correctsMeasurementId
              ? 'INDICATOR_MEASUREMENT_CORRECTED'
              : 'INDICATOR_MEASUREMENT_RECORDED',
            selected,
            { measurementId, correctsMeasurementId: input.correctsMeasurementId ?? null },
          )
        } catch (error) {
          monitoringSqlError(error)
        }
        return this.readOne(tx, actor, id, selected)
      },
    )
  }
}
