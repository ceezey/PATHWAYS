import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type RecordIndicatorMeasurementRequest,
  normalizeMetricDecimal,
  recordIndicatorMeasurementRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'
import {
  beginRuleSourceOperation,
  bootstrapRuleSourceProject,
  finishRuleSourceOperation,
  readRuleSourceAcknowledgement,
  sourceMutationBody,
} from '../rules/rules-source-operation'
import {
  indicatorIdOrNotFound,
  monitoringSqlError,
  parseIndicatorRequest,
} from './indicators.helpers'
import { IndicatorsService } from './indicators.service'

// Records and corrects manual measurements for the indicator module.
@Injectable()
export class IndicatorMeasurementsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IndicatorsService) private readonly indicators: IndicatorsService,
  ) {}

  async measure(
    identity: ApplicationIdentity,
    projectId: string,
    indicatorId: string,
    value: unknown,
  ) {
    const input: RecordIndicatorMeasurementRequest = parseIndicatorRequest(
      recordIndicatorMeasurementRequest,
      value,
    )
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.update',
      async (tx, actor) => {
        const body = sourceMutationBody(input)
        const key = { kind: 'CLIENT_MEASUREMENT' as const, id: input.clientMeasurementId }
        const acknowledgement = await readRuleSourceAcknowledgement(
          tx,
          'INDICATOR_MEASUREMENT',
          projectId,
          indicatorId,
          key,
          body,
        )
        if (acknowledgement) return acknowledgement
        await bootstrapRuleSourceProject(tx, projectId, 'INDICATOR_MEASUREMENT')
        const id = await requireScopedProject(tx, actor, projectId)
        const selected = indicatorIdOrNotFound(indicatorId)
        let definition = await this.indicators.readOne(tx, actor, id, selected)
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
        const source = await beginRuleSourceOperation(
          tx,
          'INDICATOR_MEASUREMENT',
          id,
          selected,
          key,
          body,
        )
        if (source.kind === 'REPLAY') return source.acknowledgement
        await tx.$queryRaw`SELECT id FROM pathways.project_indicators WHERE organization_id=${actor.organizationId}::uuid AND project_id=${id}::uuid AND id=${selected}::uuid FOR UPDATE`
        definition = await this.indicators.readOne(tx, actor, id, selected)
        if (
          !source.generatedValues.normalizedValue ||
          !source.generatedValues.requestHash ||
          normalizeMetricDecimal(
            source.generatedValues.normalizedValue,
            definition.numericKind ?? 'SIGNED_CHANGE',
          ) !== source.generatedValues.normalizedValue
        )
          throw new ServiceUnavailableException('Measurement verification could not be confirmed.')
        exact = source.generatedValues.normalizedValue
        if (definition.status === 'ARCHIVED')
          throw new ConflictException('Archived indicators do not accept measurements.')
        if (definition.measurementId !== (input.correctsMeasurementId?.toLowerCase() ?? null))
          throw new ConflictException(
            'Correct the latest measurement with a reason, or reload before creating the first value.',
          )
        const measurementId = source.reservedRecordId
        if (!measurementId)
          throw new ServiceUnavailableException('Measurement creation could not be confirmed.')
        try {
          await tx.$executeRaw`
          INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,note,client_measurement_id,request_hash,corrects_measurement_id,correction_reason,recorded_by_id)
          VALUES (${measurementId}::uuid,${actor.organizationId}::uuid,${id}::uuid,${selected}::uuid,${input.periodStart}::date,${input.periodEnd}::date,${exact}::numeric,${input.source},${input.note ?? null},${input.clientMeasurementId}::uuid,${source.generatedValues.requestHash},${input.correctsMeasurementId?.toLowerCase() ?? null}::uuid,${input.correctionReason ?? null},${actor.userId}::uuid)
        `
          await writeAuditLog(tx, actor, {
            projectId: id,
            action: input.correctsMeasurementId
              ? 'INDICATOR_MEASUREMENT_CORRECTED'
              : 'INDICATOR_MEASUREMENT_RECORDED',
            entityType: 'ProjectIndicator',
            entityId: selected,
            changes: { measurementId, correctsMeasurementId: input.correctsMeasurementId ?? null },
          })
        } catch (error) {
          monitoringSqlError(error)
        }
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMeasurementId,
        )
        return {
          ...(await this.indicators.readOne(tx, actor, id, selected)),
          sourceAcknowledgement,
        }
      },
    )
  }
}
