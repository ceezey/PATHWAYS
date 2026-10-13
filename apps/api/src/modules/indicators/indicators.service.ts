import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type ArchiveIndicatorRequest,
  type CreateIndicatorRequest,
  type IndicatorResponse,
  P06_CONTRACT_VERSION,
  type UpdateIndicatorRequest,
  createIndicatorRequest,
  normalizeMetricDecimal,
  updateIndicatorRequest,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  sourceMutationBody,
} from '../rules/rules-source-operation'
import {
  indicatorIdOrNotFound,
  monitoringSqlError,
  parseIndicatorRequest,
} from './indicators.helpers'
import { releasedNulls, toIndicatorResponse } from './indicators.mapper'

type DefinitionRow = Omit<IndicatorResponse, 'progress' | 'contractVersion'>

@Injectable()
export class IndicatorsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Called only inside a current authorized transaction with server-derived scope. */
  private async readProjectIndicatorsInTransaction(
    tx: Tx,
    actor: ApplicationIdentity,
    projectIds: string[],
    options: { indicatorId?: string; periodStart?: string; periodEnd?: string } = {},
  ): Promise<IndicatorResponse[]> {
    if (projectIds.length === 0) return []
    if (projectIds.length > 100 || projectIds.some((id) => !UUID_PATTERN.test(id)))
      throw new BadRequestException('Narrow the monitoring project scope.')
    const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
    await tx.$queryRaw`SELECT set_config('statement_timeout','3000',true)`
    let rows: DefinitionRow[]
    try {
      rows = await tx.$queryRaw<DefinitionRow[]>(Prisma.sql`
        SELECT i.id::text AS id,i.project_id::text AS "projectId",i.code,i.name,i.description,i.indicator_type::text AS "indicatorType",
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
    return rows.map((row) => toIndicatorResponse(row, 'Stored indicator contract is unavailable.'))
  }

  async readInTransaction(
    tx: Tx,
    actor: ApplicationIdentity,
    projectIds: string[],
    options: { indicatorId?: string; periodStart?: string; periodEnd?: string } = {},
  ): Promise<IndicatorResponse[]> {
    return this.readProjectIndicatorsInTransaction(tx, actor, projectIds, options)
  }

  /** KPI values from pathways.p06_indicator_values for every role holding monitoring.read and reports.indicator.read. */
  async readReleasedInTransaction(
    tx: Tx,
    actor: ApplicationIdentity,
    projectIds: string[],
    options: { periodStart?: string; periodEnd?: string } = {},
  ): Promise<IndicatorResponse[]> {
    if (projectIds.length === 0) return []
    if (projectIds.length > 100 || projectIds.some((id) => !UUID_PATTERN.test(id)))
      throw new BadRequestException('Narrow the monitoring project scope.')
    const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
    await tx.$queryRaw`SELECT set_config('statement_timeout','3000',true)`
    let rows: Array<{ item: Record<string, unknown> }>
    try {
      rows = await tx.$queryRaw<Array<{ item: Record<string, unknown> }>>(Prisma.sql`
        SELECT v.item
        FROM unnest(ARRAY[${Prisma.join(projectIds.map((id) => Prisma.sql`${id}::uuid`))}]::uuid[]) AS p(id)
        CROSS JOIN LATERAL jsonb_array_elements(pathways.p06_indicator_values(p.id, ${zone})) AS v(item)
        WHERE ${options.periodStart ?? null}::text IS NULL
          OR (v.item->>'periodStart' = ${options.periodStart ?? null}::text AND v.item->>'periodEnd' = ${options.periodEnd ?? null}::text)
        ORDER BY v.item->>'code', v.item->>'id'
        LIMIT 101
      `)
    } catch (error) {
      monitoringSqlError(error)
    }
    if (rows.length > 100)
      throw new BadRequestException(
        'More than 100 indicator definitions match; narrow the project scope.',
      )
    return rows.map(({ item }) =>
      toIndicatorResponse(
        { ...item, ...releasedNulls },
        'Released indicator contract is unavailable.',
      ),
    )
  }

  listReleased(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'reports.indicator.read',
      async (tx, actor) =>
        this.readReleasedInTransaction(tx, actor, [
          await requireScopedProject(tx, actor, projectId),
        ]),
    )
  }

  /** Reads one indicator inside the caller's authorized transaction. */
  async readOne(tx: Tx, actor: ApplicationIdentity, projectId: string, indicatorId: string) {
    const [row] = await this.readProjectIndicatorsInTransaction(tx, actor, [projectId], {
      indicatorId,
    })
    if (!row) throw new NotFoundException('Indicator unavailable.')
    return row
  }
  list(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'indicators.read', async (tx, actor) =>
      this.readProjectIndicatorsInTransaction(tx, actor, [
        await requireScopedProject(tx, actor, projectId),
      ]),
    )
  }
  get(identity: ApplicationIdentity, projectId: string, indicatorId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'indicators.read', async (tx, actor) =>
      this.readOne(
        tx,
        actor,
        await requireScopedProject(tx, actor, projectId),
        indicatorIdOrNotFound(indicatorId),
      ),
    )
  }
  private async validateBinding(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    input: CreateIndicatorRequest,
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
    const input: CreateIndicatorRequest = parseIndicatorRequest(createIndicatorRequest, value)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.create',
      async (tx, actor) => {
        const source = await beginRuleSourceOperation(
          tx,
          'INDICATOR_CREATE',
          projectId,
          null,
          { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
          sourceMutationBody(input),
        )
        if (source.kind === 'REPLAY') return source.acknowledgement
        const id = await requireScopedProject(tx, actor, projectId)
        await tx.$queryRaw`SELECT id FROM pathways.projects WHERE organization_id=${actor.organizationId}::uuid AND id=${id}::uuid FOR UPDATE`
        await this.validateBinding(tx, actor, id, input)
        const [size] = await tx.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pathways.project_indicators WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND archived_at IS NULL`
        if (size && size.count >= 100n)
          throw new ConflictException(
            'Archive unused indicators before adding more than 100 active definitions.',
          )
        const indicatorId = source.reservedRecordId
        if (!indicatorId)
          throw new ServiceUnavailableException('Indicator creation could not be confirmed.')
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
          INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,description,indicator_type,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
          VALUES (${indicatorId}::uuid,${actor.organizationId}::uuid,${id}::uuid,${input.code},${input.name},${input.description ?? null},${input.indicatorType ?? 'OUTPUT'}::pathways.indicator_type,${unit}::pathways.indicator_unit,${input.unitLabel},${input.dataSource},${input.mode},${input.numericKind},${input.direction},${input.displayPrecision},${input.periodStart}::date,${input.periodEnd}::date,${baseline}::numeric,${target}::numeric,${actor.userId}::uuid)
        `
          if (input.binding) {
            const b = input.binding
            await tx.$executeRaw`
            INSERT INTO pathways.project_indicator_bindings(organization_id,project_id,indicator_id,recipe,activity_id,form_id,form_version,field_id,created_by_id)
            VALUES (${actor.organizationId}::uuid,${id}::uuid,${indicatorId}::uuid,${b.recipe},${b.activityId ?? null}::uuid,${b.formId ?? null}::uuid,${b.formVersion ?? null},${b.fieldId ?? null}::uuid,${actor.userId}::uuid)
          `
          }
          await writeAuditLog(tx, actor, {
            projectId: id,
            action: 'PROJECT_INDICATOR_CREATED',
            entityType: 'ProjectIndicator',
            entityId: indicatorId,
            changes: {
              mode: input.mode,
              numericKind: input.numericKind,
              recipe: input.binding?.recipe ?? null,
              contractVersion: P06_CONTRACT_VERSION,
            },
          })
        } catch (error) {
          monitoringSqlError(error)
        }
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        return { ...(await this.readOne(tx, actor, id, indicatorId)), sourceAcknowledgement }
      },
    )
  }
  async update(
    identity: ApplicationIdentity,
    projectId: string,
    indicatorId: string,
    value: unknown,
  ) {
    const input: UpdateIndicatorRequest = parseIndicatorRequest(updateIndicatorRequest, value)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.update',
      async (tx, actor) => {
        const source = await beginRuleSourceOperation(
          tx,
          'INDICATOR_UPDATE',
          projectId,
          indicatorId,
          { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
          sourceMutationBody(input),
        )
        if (source.kind === 'REPLAY') return source.acknowledgement
        const id = await requireScopedProject(tx, actor, projectId)
        const selected = indicatorIdOrNotFound(indicatorId)
        try {
          const count =
            await tx.$executeRaw`UPDATE pathways.project_indicators SET name=${input.name},description=${input.description ?? null},revision=revision+1,updated_at=${source.generatedValues.timestamp}::timestamptz WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND id=${selected}::uuid AND revision=${input.expectedRevision} AND archived_at IS NULL`
          if (count !== 1)
            throw new ConflictException(
              'Indicator changed or is unavailable. Reload before editing.',
            )
          await writeAuditLog(tx, actor, {
            projectId: id,
            action: 'PROJECT_INDICATOR_LABEL_UPDATED',
            entityType: 'ProjectIndicator',
            entityId: selected,
            changes: { revision: input.expectedRevision + 1 },
          })
        } catch (error) {
          monitoringSqlError(error)
        }
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        return { ...(await this.readOne(tx, actor, id, selected)), sourceAcknowledgement }
      },
    )
  }
  archive(
    identity: ApplicationIdentity,
    projectId: string,
    indicatorId: string,
    input: ArchiveIndicatorRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.archive',
      async (tx, actor) => {
        const source = await beginRuleSourceOperation(
          tx,
          'INDICATOR_ARCHIVE',
          projectId,
          indicatorId,
          { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
          sourceMutationBody(input),
        )
        if (source.kind === 'REPLAY') return source.acknowledgement
        const id = await requireScopedProject(tx, actor, projectId)
        const selected = indicatorIdOrNotFound(indicatorId)
        try {
          const count =
            await tx.$executeRaw`UPDATE pathways.project_indicators SET archived_at=${source.generatedValues.timestamp}::timestamptz,revision=revision+1,updated_at=${source.generatedValues.timestamp}::timestamptz WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND id=${selected}::uuid AND revision=${input.expectedRevision} AND archived_at IS NULL`
          if (count !== 1)
            throw new ConflictException(
              'Indicator changed or is unavailable. Reload before archiving.',
            )
          await writeAuditLog(tx, actor, {
            projectId: id,
            action: 'PROJECT_INDICATOR_ARCHIVED',
            entityType: 'ProjectIndicator',
            entityId: selected,
            changes: { revision: input.expectedRevision + 1 },
          })
        } catch (error) {
          monitoringSqlError(error)
        }
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        return { ...(await this.readOne(tx, actor, id, selected)), sourceAcknowledgement }
      },
    )
  }
}
