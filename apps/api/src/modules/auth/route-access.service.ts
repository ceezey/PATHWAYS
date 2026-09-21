import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
// One dependency-free policy; no browser state or frontend adapter is imported.
import {
  type RouteDecision,
  isAggregateOnly,
  parseRouteSelection,
  routeAllowed,
} from '../../../../web/src/lib/rbac/route-access'
import { PrismaService } from '../../prisma/prisma.service'
import { prismaDiagnosticCode, transactionDiagnostic } from '../../prisma/transaction-diagnostic'
import { projectScope } from './authorized-data.service'
import { type ApplicationIdentity, UUID_PATTERN } from './developer-access'

type VerificationStage =
  | 'CONTEXT_OR_TRANSACTION'
  | 'PROJECT_READ'
  | 'ACTIVITY_READ'
  | 'BENEFICIARY_SCOPE_READ'
  | 'TRANSACTION_COMPLETION'
const diagnosticCodes = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2010',
  'P2021',
  'P2022',
  'P2024',
  'P2028',
])

@Injectable()
export class RouteAccessService {
  private readonly logger = new Logger(RouteAccessService.name)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async check(
    identity: ApplicationIdentity,
    input: Record<string, unknown>,
  ): Promise<RouteDecision> {
    const selected = parseRouteSelection(input)
    if (
      !selected ||
      !identity ||
      identity.aal !== 'aal2' ||
      !UUID_PATTERN.test(identity.id) ||
      !UUID_PATTERN.test(identity.userId) ||
      !UUID_PATTERN.test(identity.organizationId) ||
      identity.roles.length !== 1 ||
      !routeAllowed(identity, selected, false)
    )
      throw new ForbiddenException('Route unavailable.')

    const decision = (): RouteDecision => ({
      route: selected.route,
      authorization: 'database-verified',
      beneficiaryAccess: isAggregateOnly(identity) ? 'aggregate-only' : 'records-or-none',
    })

    // The global guard has already verified Auth/session liveness and resolved a
    // fresh database profile for this request. Workspace-level destinations need
    // no second profile transaction. Object routes still perform their scoped
    // relational lookup under verified context and RLS below.
    if (!selected.projectId && !selected.activityId && !selected.beneficiaryId) {
      return decision()
    }

    let stage: VerificationStage = 'CONTEXT_OR_TRANSACTION'
    try {
      return await this.prisma.withVerifiedContext(
        {
          authSubject: identity.id,
          organizationId: identity.organizationId,
          userId: identity.userId,
        },
        async (tx) => {
          if (selected.projectId) {
            stage = 'PROJECT_READ'
            const project = await tx.project.findFirst({
              where: { AND: [projectScope(identity), { id: selected.projectId }] },
              select: { id: true },
            })
            if (!project) throw new NotFoundException('Route unavailable.')
          }
          if (selected.activityId) {
            stage = 'ACTIVITY_READ'
            const activity = await tx.projectActivity.findFirst({
              where: {
                id: selected.activityId,
                projectId: selected.projectId,
                organizationId: identity.organizationId,
                archivedAt: null,
              },
              select: { id: true },
            })
            if (!activity) throw new NotFoundException('Route unavailable.')
          }
          if (selected.beneficiaryId) {
            stage = 'BENEFICIARY_SCOPE_READ'
            const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
              where: {
                organizationId: identity.organizationId,
                beneficiaryId: selected.beneficiaryId,
                ...(selected.projectId ? { projectId: selected.projectId } : {}),
                beneficiary: { organizationId: identity.organizationId, archivedAt: null },
                project: projectScope(identity),
              },
              select: { id: true },
            })
            if (!enrollment) throw new NotFoundException('Route unavailable.')
          }
          stage = 'TRANSACTION_COMPLETION'
          return decision()
        },
      )
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) throw error
      if (process.env.NODE_ENV === 'development') {
        try {
          // Fixed operational categories only, separate from HTTP request logs.
          // No getters, provider messages, metadata, causes or SQL are emitted.
          // The shared classifier privately recognizes bounded own-data shapes.
          const code = prismaDiagnosticCode(error)
          this.logger.warn({
            event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
            stage,
            reason: typeof code === 'string' && diagnosticCodes.has(code) ? code : 'CHECK_FAILED',
            ...transactionDiagnostic(error),
          })
        } catch {
          // Diagnostics may fail, but the protected request must still fail closed.
        }
      }
      throw new ServiceUnavailableException('Route verification is temporarily unavailable.')
    }
  }
}
