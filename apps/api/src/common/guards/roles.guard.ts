import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import type { AppRole } from '@pathways/shared'

import { ROLES_KEY } from '@app/common/decorators/roles.decorator'

interface AppRequest {
  user?: {
    roles?: AppRole[]
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles?.length) {
      return true
    }

    const request = context.switchToHttp().getRequest<AppRequest>()
    const userRoles = request.user?.roles ?? []
    const allowed = requiredRoles.some((role) => userRoles.includes(role))

    if (!allowed) {
      throw new ForbiddenException('Required application role is missing.')
    }

    return true
  }
}
