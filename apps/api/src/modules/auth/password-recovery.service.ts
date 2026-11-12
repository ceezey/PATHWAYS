import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import { readApiEnv } from '@pathways/config'
import { hasRecentRecoverySignIn } from '@pathways/shared'
import { UUID_PATTERN } from '../../common/authz/application-identity'
import { PrismaService } from '../../prisma/prisma.service'
import { verifiedAuthOrigin } from '../users/auth-directory.service'

const bearerPattern = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/
const unconfirmed = () =>
  new ServiceUnavailableException('The password change could not be confirmed.')

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Sets the password through the admin API, so a recovery session works with or without MFA enrolled.
  async complete(authorization: string | undefined, password: string) {
    const token = bearerPattern.exec(authorization ?? '')?.[1]
    if (!token) throw new UnauthorizedException('Invalid or expired recovery session.')
    const client = this.client()
    const userId = await this.recoveryUserId(client, token)

    let updateError: { status?: unknown } | null
    try {
      ;({ error: updateError } = await client.auth.admin.updateUserById(userId, { password }))
    } catch {
      throw unconfirmed()
    }
    if (updateError) {
      const status = updateError.status
      if (typeof status === 'number' && status >= 400 && status < 500) {
        throw new BadRequestException('The password was not changed.')
      }
      throw unconfirmed()
    }

    await this.recordReset(userId)

    let sessionsClosed = false
    try {
      sessionsClosed = !(await client.auth.admin.signOut(token, 'global')).error
    } catch {
      // The password change is committed even when ending the sessions is unconfirmed.
    }
    return { ok: true as const, sessionsClosed }
  }

  // Writes PASSWORD_RESET_COMPLETED through the definer; the password change is already committed.
  private async recordReset(authSubject: string) {
    try {
      await this.prisma
        .$queryRaw`SELECT 0 AS s FROM (SELECT pathways.p90_record_password_reset(${authSubject}::uuid)) r`
    } catch {
      this.logger.warn({ event: 'PATHWAYS_PASSWORD_RESET_AUDIT_FAILED' })
    }
  }

  private client() {
    try {
      const env = readApiEnv(process.env)
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error()
      return createClient(verifiedAuthOrigin(env.SUPABASE_URL), env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) }),
        },
      })
    } catch {
      throw new ServiceUnavailableException('Password recovery is unavailable.')
    }
  }

  // Returns the Auth user of a signed, live session opened from a recovery or invite link in the window.
  private async recoveryUserId(client: SupabaseClient, token: string) {
    try {
      const { data, error } = await client.auth.getClaims(token)
      const claims = data?.claims
      const issuer = `${verifiedAuthOrigin(readApiEnv(process.env).SUPABASE_URL ?? '')}/auth/v1`
      if (
        error ||
        !claims ||
        claims.iss !== issuer ||
        claims.aud !== 'authenticated' ||
        claims.role !== 'authenticated' ||
        claims.is_anonymous !== false ||
        typeof claims.sub !== 'string' ||
        !UUID_PATTERN.test(claims.sub) ||
        typeof claims.session_id !== 'string' ||
        !UUID_PATTERN.test(claims.session_id) ||
        typeof claims.exp !== 'number' ||
        claims.exp <= Date.now() / 1000 ||
        !hasRecentRecoverySignIn(claims.amr)
      ) {
        throw new Error()
      }
      // A revoked session fails here even while its token is unexpired.
      const current = await client.auth.getUser(token)
      if (current.error || current.data.user?.id !== claims.sub) throw new Error()
      return claims.sub
    } catch {
      throw new UnauthorizedException('Invalid or expired recovery session.')
    }
  }
}
