import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { type AtomicPermission, hasAtomicPermission } from '../auth/authorization-policy'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { uuidSchema } from './rule-contract'
import { evaluateRule } from './rule-engine'
import * as contracts from './rules-human-contract'

type Operation =
  | 'RULE_LIST'
  | 'RULE_GET'
  | 'RULE_CREATE'
  | 'RULE_DRAFT'
  | 'RULE_ACTIVATE'
  | 'RULE_ARCHIVE'
  | 'ALERT_LIST'
  | 'ALERT_GET'
  | 'ALERT_HISTORY'
  | 'ALERT_REVIEW'
  | 'ALERT_DISPOSITION'
  | 'ALERT_PREVIEW'
  | 'ALERT_CONFIRM'
  | 'RECOMMENDATION_LIST'
  | 'RECOMMENDATION_GET'
  | 'RECOMMENDATION_REVIEW'
  | 'RECOMMENDATION_PREVIEW'
  | 'RECOMMENDATION_CONFIRM'
  | 'NOTIFICATION_LIST'
  | 'NOTIFICATION_READ'

// Only this fixed table maps server-owned operations to fixed database routines.
// No identifier, SQL, actor or permission can be supplied by a request.
function operationSql(operation: Operation, id: string | null, input: unknown): Prisma.Sql {
  const body = JSON.stringify(input ?? null)
  switch (operation) {
    case 'RULE_LIST':
      return Prisma.sql`SELECT pathways.f10_rule_list(${body}::jsonb) AS result`
    case 'RULE_GET':
      return Prisma.sql`SELECT pathways.f10_rule_get(${id}::uuid) AS result`
    case 'RULE_CREATE':
      return Prisma.sql`SELECT pathways.f10_rule_create(${body}::jsonb) AS result`
    case 'RULE_DRAFT':
      return Prisma.sql`SELECT pathways.f10_rule_draft(${id}::uuid,${body}::jsonb) AS result`
    case 'RULE_ACTIVATE':
      return Prisma.sql`SELECT pathways.f10_rule_activate(${id}::uuid,${body}::jsonb) AS result`
    case 'RULE_ARCHIVE':
      return Prisma.sql`SELECT pathways.f10_rule_archive(${id}::uuid,${body}::jsonb) AS result`
    case 'ALERT_LIST':
      return Prisma.sql`SELECT pathways.f10_alert_list(${body}::jsonb) AS result`
    case 'ALERT_GET':
      return Prisma.sql`SELECT pathways.f10_alert_get(${id}::uuid) AS result`
    case 'ALERT_HISTORY':
      return Prisma.sql`SELECT pathways.f10_alert_history(${id}::uuid,${body}::jsonb) AS result`
    case 'ALERT_REVIEW':
      return Prisma.sql`SELECT pathways.f10_alert_review(${id}::uuid,${body}::jsonb) AS result`
    case 'ALERT_DISPOSITION':
      return Prisma.sql`SELECT pathways.f10_alert_disposition(${id}::uuid,${body}::jsonb) AS result`
    case 'ALERT_PREVIEW':
      return Prisma.sql`SELECT pathways.f10_alert_preview(${id}::uuid,${body}::jsonb) AS result`
    case 'ALERT_CONFIRM':
      return Prisma.sql`SELECT pathways.f10_alert_confirm(${id}::uuid,${body}::jsonb) AS result`
    case 'RECOMMENDATION_LIST':
      return Prisma.sql`SELECT pathways.f10_recommendation_list(${body}::jsonb) AS result`
    case 'RECOMMENDATION_GET':
      return Prisma.sql`SELECT pathways.f10_recommendation_get(${id}::uuid) AS result`
    case 'RECOMMENDATION_REVIEW':
      return Prisma.sql`SELECT pathways.f10_recommendation_review(${id}::uuid,${body}::jsonb) AS result`
    case 'RECOMMENDATION_PREVIEW':
      return Prisma.sql`SELECT pathways.f10_recommendation_preview(${id}::uuid,${body}::jsonb) AS result`
    case 'RECOMMENDATION_CONFIRM':
      return Prisma.sql`SELECT pathways.f10_recommendation_confirm(${id}::uuid,${body}::jsonb) AS result`
    case 'NOTIFICATION_LIST':
      return Prisma.sql`SELECT pathways.f10_notification_list(${body}::jsonb) AS result`
    case 'NOTIFICATION_READ':
      return Prisma.sql`SELECT pathways.f10_notification_read(${id}::uuid) AS result`
  }
}
const configurationDenied =
  'Project rule configuration is unavailable under your current authority.'
function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw new BadRequestException('Invalid typed rules request.')
  return result.data
}

@Injectable()
export class RulesHumanService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private execute<T extends z.ZodTypeAny>(
    identity: ApplicationIdentity,
    permission: AtomicPermission,
    operation: Operation,
    idInput: string | null,
    input: unknown,
    output: T,
    additionalPermission?: AtomicPermission,
  ): Promise<z.output<T>> {
    const id = idInput === null ? null : parse(uuidSchema, idInput)
    return withAuthorizedOperation(this.prisma, identity, permission, async (tx, actor) => {
      if (
        additionalPermission &&
        !hasAtomicPermission(actor.roles[0], actor.permissions, additionalPermission)
      )
        throw new ForbiddenException('Required application permission is missing.')
      let rows: Array<{ result: unknown }>
      try {
        rows = await tx.$queryRaw(operationSql(operation, id, input))
      } catch (error) {
        const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : null
        const code = meta && typeof meta === 'object' && 'code' in meta ? meta.code : null
        if (code === '22023') throw new BadRequestException('Invalid typed rules request.')
        if (code === '40001')
          throw new ConflictException('The resource changed. Reload before retrying.')
        if (code === '42501')
          throw new ForbiddenException(
            operation.startsWith('RULE_') ? configurationDenied : 'Resource access is unavailable.',
          )
        throw new ServiceUnavailableException('Rules processing is temporarily unavailable.')
      }
      if (rows.length !== 1)
        throw new ServiceUnavailableException('Rules processing is temporarily unavailable.')
      const checked = output.safeParse(rows[0].result)
      if (!checked.success)
        throw new ServiceUnavailableException('Rules processing is temporarily unavailable.')
      return checked.data
    })
  }
  listRules(identity: ApplicationIdentity, query: unknown) {
    return this.execute(
      identity,
      'rules.read',
      'RULE_LIST',
      null,
      parse(contracts.ruleListSchema, query),
      contracts.pageSchema(contracts.ruleOutputSchema),
    )
  }
  getRule(identity: ApplicationIdentity, id: string) {
    return this.execute(identity, 'rules.read', 'RULE_GET', id, {}, contracts.ruleOutputSchema)
  }
  // Fixed SQL configuration wrappers perform admission under state protection
  // BEFORE validating candidate content, version or committed receipt. Parsing
  // trees here would turn an inaccessible project into a candidate-dependent
  //400/403 response. SQL applies the same strict typed schemas after admission.
  createRule(identity: ApplicationIdentity, body: unknown) {
    return this.execute(
      identity,
      'rules.create',
      'RULE_CREATE',
      null,
      body,
      contracts.ruleOutputSchema,
    )
  }
  draftRule(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'rules.update',
      'RULE_DRAFT',
      id,
      body,
      contracts.ruleOutputSchema,
    )
  }
  activateRule(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'rules.activate',
      'RULE_ACTIVATE',
      id,
      body,
      contracts.ruleOutputSchema,
    )
  }
  archiveRule(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'rules.update',
      'RULE_ARCHIVE',
      id,
      body,
      contracts.ruleOutputSchema,
    )
  }
  dryRun(identity: ApplicationIdentity, body: unknown) {
    return withAuthorizedOperation(this.prisma, identity, 'rules.read', async () => {
      try {
        return evaluateRule(body)
      } catch {
        throw new BadRequestException('Invalid synthetic typed evaluation.')
      }
    })
  }
  listAlerts(identity: ApplicationIdentity, query: unknown) {
    return this.execute(
      identity,
      'alerts.read',
      'ALERT_LIST',
      null,
      parse(contracts.alertListSchema, query),
      contracts.pageSchema(contracts.alertOutputSchema),
    )
  }
  getAlert(identity: ApplicationIdentity, id: string) {
    return this.execute(identity, 'alerts.read', 'ALERT_GET', id, {}, contracts.alertOutputSchema)
  }
  alertHistory(identity: ApplicationIdentity, id: string, query: unknown) {
    return this.execute(
      identity,
      'alerts.read',
      'ALERT_HISTORY',
      id,
      parse(contracts.historyListSchema, query),
      contracts.pageSchema(contracts.historyOutputSchema),
    )
  }
  reviewAlert(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'alerts.review',
      'ALERT_REVIEW',
      id,
      parse(contracts.reviewSchema, body),
      contracts.alertOutputSchema,
    )
  }
  dispositionAlert(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'alerts.outcome.record',
      'ALERT_DISPOSITION',
      id,
      parse(contracts.dispositionSchema, body),
      contracts.alertOutputSchema,
    )
  }
  previewAlert(identity: ApplicationIdentity, id: string, body: unknown) {
    const input = parse(contracts.alertPreviewSchema, body)
    return this.execute(
      identity,
      'alerts.outcome.record',
      'ALERT_PREVIEW',
      id,
      input,
      contracts.previewOutputSchema,
      input.recommendationId ? 'recommendations.outcome.record' : undefined,
    )
  }
  confirmAlert(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'alerts.outcome.record',
      'ALERT_CONFIRM',
      id,
      parse(contracts.confirmOutcomeSchema, body),
      contracts.confirmationOutputSchema,
    )
  }
  listRecommendations(identity: ApplicationIdentity, query: unknown) {
    return this.execute(
      identity,
      'recommendations.read',
      'RECOMMENDATION_LIST',
      null,
      parse(contracts.recommendationListSchema, query),
      contracts.pageSchema(contracts.recommendationOutputSchema),
    )
  }
  getRecommendation(identity: ApplicationIdentity, id: string) {
    return this.execute(
      identity,
      'recommendations.read',
      'RECOMMENDATION_GET',
      id,
      {},
      contracts.recommendationOutputSchema,
    )
  }
  reviewRecommendation(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'recommendations.review',
      'RECOMMENDATION_REVIEW',
      id,
      parse(contracts.reviewSchema, body),
      contracts.recommendationOutputSchema,
    )
  }
  previewRecommendation(identity: ApplicationIdentity, id: string, body: unknown) {
    const input = parse(contracts.recommendationPreviewSchema, body)
    return this.execute(
      identity,
      'recommendations.outcome.record',
      'RECOMMENDATION_PREVIEW',
      id,
      input,
      contracts.previewOutputSchema,
      ['ACCEPT', 'PARTIALLY_ACCEPT'].includes(input.outcome) ? 'alerts.outcome.record' : undefined,
    )
  }
  confirmRecommendation(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'recommendations.outcome.record',
      'RECOMMENDATION_CONFIRM',
      id,
      parse(contracts.confirmOutcomeSchema, body),
      contracts.confirmationOutputSchema,
    )
  }
  listNotifications(identity: ApplicationIdentity, query: unknown) {
    return this.execute(
      identity,
      'alerts.read',
      'NOTIFICATION_LIST',
      null,
      parse(contracts.notificationListSchema, query),
      contracts.pageSchema(contracts.notificationOutputSchema),
    )
  }
  readNotification(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'alerts.read',
      'NOTIFICATION_READ',
      id,
      parse(contracts.emptyBodySchema, body),
      contracts.notificationOutputSchema,
    )
  }
}
