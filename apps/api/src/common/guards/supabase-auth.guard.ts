import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { readApiEnv } from '@pathways/config'
import type { AppRole } from '@pathways/shared'

import { IS_PUBLIC_KEY } from '@app/common/decorators/public.decorator'

interface AppRequestUser {
  token?: string
  roles: AppRole[]
}

interface AppRequest {
  headers?: {
    authorization?: string
  }
  user?: AppRequestUser
  authPlaceholder?: string
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest<AppRequest>()
    const env = readApiEnv(process.env)
    const authHeader = String(request.headers?.authorization ?? '')

    if (!env.SUPABASE_JWT_SECRET) {
      request.authPlaceholder = 'Configure SUPABASE_JWT_SECRET to enforce bearer verification.'
      return true
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.')
    }

    request.user = {
      token: authHeader.replace('Bearer ', ''),
      roles: request.user?.roles ?? [],
    }

    return true
  }
}
