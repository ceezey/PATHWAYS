import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type AtomicPermission,
  alertListSchema,
  alertOutputSchema,
  alertPreviewSchema,
  confirmOutcomeSchema,
  confirmationOutputSchema,
  dispositionSchema,
  emptyBodySchema,
  escalatedAlertListSchema,
  escalatedAlertOutputSchema,
  hasAtomicPermission,
  historyListSchema,
  historyOutputSchema,
  notificationListSchema,
  notificationOutputSchema,
  pageSchema,
  previewOutputSchema,
  recommendationListSchema,
  recommendationOutputSchema,
  recommendationPreviewSchema,
  reviewSchema,
  ruleListSchema,
  ruleOutputSchema,
  uuidSchema,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { PrismaService } from '../../prisma/prisma.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { evaluateRule } from './rule-engine'

type Operation =
  | 'RULE_LIST'
  | 'RULE_GET'
  | 'RULE_CREATE'
  | 'RULE_DRAFT'
  | 'RULE_ACTIVATE'
  | 'RULE_ARCHIVE'
  | 'ALERT_LIST'
  | 'ESCALATED_ALERT_LIST'
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
    case 'ESCALATED_ALERT_LIST':
      return Prisma.sql`SELECT pathways.f10_escalated_alert_list(${body}::jsonb) AS result`
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
    return withAuthorizedOperation(this.prisma, identity, permission, (tx, actor) =>
      this.executeInTransaction(tx, actor, operation, id, input, output, additionalPermission),
    )
  }
  private async executeInTransaction<T extends z.ZodTypeAny>(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    operation: Operation,
    id: string | null,
    input: unknown,
    output: T,
    additionalPermission?: AtomicPermission,
  ): Promise<z.output<T>> {
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
  }
  /** Lists alerts inside an already-authorized report transaction; alerts.read is still required. */
  listAlertsInTransaction(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: unknown,
  ) {
    return this.executeInTransaction(
      tx,
      actor,
      'ALERT_LIST',
      null,
      parse(alertListSchema, query),
      pageSchema(alertOutputSchema),
      'alerts.read',
    )
  }
  listRules(identity: ApplicationIdentity, query: unknown) {
    return this.execute(
      identity,
      'rules.read',
      'RULE_LIST',
      null,
      parse(ruleListSchema, query),
      pageSchema(ruleOutputSchema),
    )
  }
  getRule(identity: ApplicationIdentity, id: string) {
    return this.execute(identity, 'rules.read', 'RULE_GET', id, {}, ruleOutputSchema)
  }
  // Fixed SQL configuration wrappers perform admission under state protection
  // BEFORE validating candidate content, version or committed receipt. Parsing
  // trees here would turn an inaccessible project into a candidate-dependent
  //400/403 response. SQL applies the same strict typed schemas after admission.
  createRule(identity: ApplicationIdentity, body: unknown) {
    return this.execute(identity, 'rules.create', 'RULE_CREATE', null, body, ruleOutputSchema)
  }
  draftRule(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(identity, 'rules.update', 'RULE_DRAFT', id, body, ruleOutputSchema)
  }
  activateRule(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(identity, 'rules.activate', 'RULE_ACTIVATE', id, body, ruleOutputSchema)
  }
  archiveRule(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(identity, 'rules.update', 'RULE_ARCHIVE', id, body, ruleOutputSchema)
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
      parse(alertListSchema, query),
      pageSchema(alertOutputSchema),
    )
  }
  // Read-only queue of alerts whose latest recorded outcome is ESCALATE; the limit defaults like listAlerts.
  listEscalatedAlerts(identity: ApplicationIdentity, query: unknown) {
    return this.execute(
      identity,
      'alerts.read',
      'ESCALATED_ALERT_LIST',
      null,
      parse(escalatedAlertListSchema, query),
      pageSchema(escalatedAlertOutputSchema),
    )
  }
  getAlert(identity: ApplicationIdentity, id: string) {
    return this.execute(identity, 'alerts.read', 'ALERT_GET', id, {}, alertOutputSchema)
  }
  alertHistory(identity: ApplicationIdentity, id: string, query: unknown) {
    return this.execute(
      identity,
      'alerts.read',
      'ALERT_HISTORY',
      id,
      parse(historyListSchema, query),
      pageSchema(historyOutputSchema),
    )
  }
  reviewAlert(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'alerts.review',
      'ALERT_REVIEW',
      id,
      parse(reviewSchema, body),
      alertOutputSchema,
    )
  }
  dispositionAlert(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'alerts.outcome.record',
      'ALERT_DISPOSITION',
      id,
      parse(dispositionSchema, body),
      alertOutputSchema,
    )
  }
  previewAlert(identity: ApplicationIdentity, id: string, body: unknown) {
    const input = parse(alertPreviewSchema, body)
    return this.execute(
      identity,
      'alerts.outcome.record',
      'ALERT_PREVIEW',
      id,
      input,
      previewOutputSchema,
      input.recommendationId ? 'recommendations.outcome.record' : undefined,
    )
  }
  confirmAlert(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'alerts.outcome.record',
      'ALERT_CONFIRM',
      id,
      parse(confirmOutcomeSchema, body),
      confirmationOutputSchema,
    )
  }
  listRecommendations(identity: ApplicationIdentity, query: unknown) {
    return this.execute(
      identity,
      'recommendations.read',
      'RECOMMENDATION_LIST',
      null,
      parse(recommendationListSchema, query),
      pageSchema(recommendationOutputSchema),
    )
  }
  getRecommendation(identity: ApplicationIdentity, id: string) {
    return this.execute(
      identity,
      'recommendations.read',
      'RECOMMENDATION_GET',
      id,
      {},
      recommendationOutputSchema,
    )
  }
  reviewRecommendation(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'recommendations.review',
      'RECOMMENDATION_REVIEW',
      id,
      parse(reviewSchema, body),
      recommendationOutputSchema,
    )
  }
  previewRecommendation(identity: ApplicationIdentity, id: string, body: unknown) {
    const input = parse(recommendationPreviewSchema, body)
    return this.execute(
      identity,
      'recommendations.outcome.record',
      'RECOMMENDATION_PREVIEW',
      id,
      input,
      previewOutputSchema,
      ['ACCEPT', 'PARTIALLY_ACCEPT'].includes(input.outcome) ? 'alerts.outcome.record' : undefined,
    )
  }
  confirmRecommendation(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'recommendations.outcome.record',
      'RECOMMENDATION_CONFIRM',
      id,
      parse(confirmOutcomeSchema, body),
      confirmationOutputSchema,
    )
  }
  listNotifications(identity: ApplicationIdentity, query: unknown) {
    return this.execute(
      identity,
      'alerts.read',
      'NOTIFICATION_LIST',
      null,
      parse(notificationListSchema, query),
      pageSchema(notificationOutputSchema),
    )
  }
  readNotification(identity: ApplicationIdentity, id: string, body: unknown) {
    return this.execute(
      identity,
      'alerts.read',
      'NOTIFICATION_READ',
      id,
      parse(emptyBodySchema, body),
      notificationOutputSchema,
    )
  }
}
