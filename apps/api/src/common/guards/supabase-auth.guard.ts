import { performance } from 'node:perf_hooks'
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { hasAtomicPermission } from '../../modules/auth/authorization-policy'
import {
  type AuthorizedOperationTiming,
  registerAuthorizedOperationTiming,
} from '../../modules/auth/authorized-operation-timing'
import type { AuthenticatedRequest } from '../../modules/auth/developer-access'
import { TokenAuthService, type VerifiedAuthSession } from '../../modules/auth/token-auth.service'
import { WorkspaceResolutionService } from '../../modules/auth/workspace-resolution.service'
import type { VerifiedTransactionTiming } from '../../prisma/prisma.service'
import { AUTH_BOUNDARY_KEY } from '../decorators/auth-boundary.decorator'
import { PERMISSION_KEY } from '../decorators/permission.decorator'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

const MAX_REPORTED_STAGE_MS = 30_000
const stageDuration = (startedAt: number) =>
  Math.min(MAX_REPORTED_STAGE_MS, Math.max(0, Math.round(performance.now() - startedAt)))

function exposeDevelopmentAuthTiming(
  response: { setHeader: (name: string, value: string) => void },
  verified: VerifiedAuthSession,
  contextStage: 'session' | 'session_profile',
  contextMs: number,
  totalMs: number,
  databaseTiming?: VerifiedTransactionTiming,
) {
  if (process.env.NODE_ENV === 'production') return
  const metrics = [
    `pathways_claims;dur=${verified.stageTimings.claimsMs}`,
    `pathways_get_user;dur=${verified.stageTimings.currentUserMs}`,
  ]
  if (databaseTiming) {
    metrics.push(
      `pathways_db_acquire;dur=${databaseTiming.acquisitionMs}`,
      `pathways_db_context;dur=${databaseTiming.contextMs}`,
      `pathways_db_profile;dur=${databaseTiming.workMs}`,
    )
  }
  metrics.push(`pathways_${contextStage};dur=${contextMs}`, `pathways_auth_total;dur=${totalMs}`)
  const value = metrics.join(', ')
  response.setHeader('Server-Timing', value)
  return value
}

function operationTimingValue(timing: AuthorizedOperationTiming) {
  return [
    `pathways_op_acquire;dur=${timing.acquisitionMs}`,
    `pathways_op_context;dur=${timing.contextMs}`,
    `pathways_op_profile;dur=${timing.profileMs}`,
    `pathways_op_feature;dur=${timing.featureMs}`,
    `pathways_op_total;dur=${timing.totalMs}`,
  ].join(', ')
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenAuthService) private readonly tokens: TokenAuthService,
    @Inject(WorkspaceResolutionService) private readonly workspaces: WorkspaceResolutionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    request.user = undefined
    request.auth = undefined
    const handlers = [context.getHandler(), context.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, handlers)) return true
    // Set before validation so denials/outages are private too, not just 200s.
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader: (name: string, value: string) => void }>()
    response.setHeader('Cache-Control', 'private, no-store')

    const header = request.headers?.authorization
    if (typeof header !== 'string' || !/^Bearer [^\s]+$/i.test(header) || header.length > 16_384) {
      throw new UnauthorizedException('A bearer token is required.')
    }
    const authStartedAt = performance.now()
    const verified = await this.tokens.verifyCurrent(header.slice(7))
    const identity = verified.identity
    const boundary = this.reflector.getAllAndOverride<string>(AUTH_BOUNDARY_KEY, handlers)
    const assertSeparateSession = async () => {
      const sessionStartedAt = performance.now()
      try {
        await this.tokens.assertSessionLive(verified)
      } finally {
        exposeDevelopmentAuthTiming(
          response,
          verified,
          'session',
          stageDuration(sessionStartedAt),
          stageDuration(authStartedAt),
        )
      }
    }
    if (boundary === 'mfa-setup') {
      await assertSeparateSession()
      request.auth = identity
      return true
    }
    if (identity.aal !== 'aal2') {
      await assertSeparateSession()
      request.auth = identity
      throw new ForbiddenException('MFA verification is required before application access.')
    }
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, handlers)
    if (boundary === 'workspace-discovery' && !permission) {
      await assertSeparateSession()
      request.auth = identity
      return true
    }
    if (boundary !== 'profile' && !permission) {
      await assertSeparateSession()
      request.auth = identity
      throw new ForbiddenException('This application operation has not been authorized.')
    }
    const profileStartedAt = performance.now()
    let databaseTiming: VerifiedTransactionTiming | undefined
    let authTiming: string | undefined
    try {
      request.user = await this.workspaces.resolveSelection(
        identity,
        request.headers['x-pathways-organization-id'],
        request.headers['x-pathways-user-id'],
        verified.sessionId,
        (timing) => {
          databaseTiming = timing
        },
      )
    } finally {
      authTiming = exposeDevelopmentAuthTiming(
        response,
        verified,
        'session_profile',
        stageDuration(profileStartedAt),
        stageDuration(authStartedAt),
        databaseTiming,
      )
    }
    request.auth = identity
    if (
      permission &&
      (request.user.roles.length !== 1 ||
        !hasAtomicPermission(request.user.roles[0], request.user.permissions, permission))
    ) {
      request.user = undefined
      throw new ForbiddenException('Required application permission is missing.')
    }
    if (authTiming) {
      registerAuthorizedOperationTiming(request.user, (timing) => {
        response.setHeader('Server-Timing', `${authTiming}, ${operationTimingValue(timing)}`)
      })
    }
    return true
  }
}
