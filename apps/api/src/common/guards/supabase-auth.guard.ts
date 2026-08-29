import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createClient } from '@supabase/supabase-js'

import { readApiEnv } from '@pathways/config'
import { AppRole } from '@pathways/shared'

import { IS_PUBLIC_KEY } from '@app/common/decorators/public.decorator'

interface AppRequestUser {
  id: string
  email?: string
  roles: AppRole[]
}

interface AppRequest {
  headers?: {
    authorization?: string
  }
  user?: AppRequestUser
}

const appRoles = new Set<string>(Object.values(AppRole))

const readRoles = (metadata: Record<string, unknown>): AppRole[] => {
  const candidates = [metadata.role, ...(Array.isArray(metadata.roles) ? metadata.roles : [])]

  return [
    ...new Set(
      candidates.filter((role): role is AppRole => typeof role === 'string' && appRoles.has(role)),
    ),
  ]
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.')
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ServiceUnavailableException('Supabase authentication is not configured.')
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired bearer token.')
    }

    request.user = {
      id: data.user.id,
      email: data.user.email,
      roles: readRoles(data.user.app_metadata),
    }

    return true
  }
}
