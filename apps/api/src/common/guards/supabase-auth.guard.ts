import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { ApplicationProfileService } from '../../modules/auth/application-profile.service'
import { hasAtomicPermission } from '../../modules/auth/authorization-policy'
import {
  type AuthenticatedRequest,
  DEVELOPER_AUTH_UUID,
  developerApplicationAccessEnabled,
} from '../../modules/auth/developer-access'
import { TokenAuthService } from '../../modules/auth/token-auth.service'
import { AUTH_BOUNDARY_KEY } from '../decorators/auth-boundary.decorator'
import { PERMISSION_KEY } from '../decorators/permission.decorator'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenAuthService) private readonly tokens: TokenAuthService,
    @Inject(ApplicationProfileService) private readonly profiles: ApplicationProfileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    request.user = undefined
    request.auth = undefined
    const handlers = [context.getHandler(), context.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, handlers)) return true

    const header = request.headers?.authorization
    if (typeof header !== 'string' || !/^Bearer [^\s]+$/i.test(header) || header.length > 16_384) {
      throw new UnauthorizedException('A bearer token is required.')
    }
    const identity = await this.tokens.verify(header.slice(7))
    if (identity.id !== DEVELOPER_AUTH_UUID) {
      throw new ForbiddenException('This developer preparation is not available to this identity.')
    }
    const boundary = this.reflector.getAllAndOverride<string>(AUTH_BOUNDARY_KEY, handlers)
    request.auth = identity
    if (boundary === 'mfa-setup') return true
    if (identity.aal !== 'aal2') {
      throw new ForbiddenException('MFA verification is required before application access.')
    }
    if (!developerApplicationAccessEnabled()) {
      throw new ForbiddenException('Application access remains blocked by the onboarding gate.')
    }
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, handlers)
    if (boundary !== 'profile' && !permission) {
      throw new ForbiddenException('This application operation has not been authorized.')
    }
    request.user = await this.profiles.resolve(
      identity.id,
      request.headers['x-pathways-organization-id'],
      request.headers['x-pathways-user-id'],
    )
    if (
      permission &&
      (request.user.roles.length !== 1 ||
        !hasAtomicPermission(request.user.roles[0], request.user.permissions, permission))
    ) {
      request.user = undefined
      throw new ForbiddenException('Required application permission is missing.')
    }
    return true
  }
}
