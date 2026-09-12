import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'

import { DEVELOPER_SUPABASE_URL, UUID_PATTERN, type VerifiedAuthIdentity } from './developer-access'
import { SessionLivenessService } from './session-liveness.service'

@Injectable()
export class TokenAuthService {
  constructor(@Inject(SessionLivenessService) private readonly sessions: SessionLivenessService) {}

  async verify(token: string): Promise<VerifiedAuthIdentity> {
    // Never parse the entire environment into errors that could contain secrets.
    const url = process.env.SUPABASE_URL
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (url !== DEVELOPER_SUPABASE_URL || !key) {
      throw new ServiceUnavailableException(
        'Approved development authentication is not configured.',
      )
    }
    let verified: { identity: VerifiedAuthIdentity; sessionId: string }
    try {
      const supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: {
          // Bounded Auth reads only; never redirect bearer credentials.
          fetch: async (input, init) => {
            try {
              return await fetch(input, {
                ...init,
                redirect: 'error',
                signal: AbortSignal.timeout(10_000),
              })
            } catch {
              // Auth JS logs rejected fetch errors before our outer catch. Convert
              // transport failure to an empty denial, never a provider diagnostic.
              return new Response(null, { status: 503 })
            }
          },
        },
      })
      const result = await supabase.auth.getClaims(token)
      if (result.error || !result.data) throw new Error('Invalid token')
      const claims = result.data.claims
      const now = Date.now() / 1000
      // AAL alone does not distinguish password from passwordless OTP/magic-link
      // sessions. PATHWAYS requires the signed session history to include password.
      const hasPasswordAuthentication =
        Array.isArray(claims.amr) &&
        claims.amr.some(
          (method) =>
            typeof method === 'object' &&
            method !== null &&
            method.method === 'password' &&
            typeof method.timestamp === 'number' &&
            Number.isFinite(method.timestamp) &&
            method.timestamp <= now + 30,
        )
      if (
        claims.iss !== `${DEVELOPER_SUPABASE_URL}/auth/v1` ||
        claims.aud !== 'authenticated' ||
        claims.role !== 'authenticated' ||
        typeof claims.sub !== 'string' ||
        !UUID_PATTERN.test(claims.sub) ||
        typeof claims.session_id !== 'string' ||
        !UUID_PATTERN.test(claims.session_id) ||
        claims.is_anonymous !== false ||
        typeof claims.exp !== 'number' ||
        !Number.isFinite(claims.exp) ||
        claims.exp <= now ||
        typeof claims.iat !== 'number' ||
        !Number.isFinite(claims.iat) ||
        claims.iat > now + 30 ||
        (claims.nbf !== undefined &&
          (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > now)) ||
        (claims.aal !== 'aal1' && claims.aal !== 'aal2') ||
        !hasPasswordAuthentication
      ) {
        throw new Error('Invalid claims')
      }
      // Current identity + verified signature. Neither metadata field grants authority.
      const current = await supabase.auth.getUser(token)
      if (
        current.error ||
        !current.data.user ||
        current.data.user.id !== claims.sub ||
        current.data.user.is_anonymous !== false ||
        (claims.aal === 'aal2' &&
          !current.data.user.factors?.some(
            (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
          ))
      ) {
        throw new Error('Invalid current identity')
      }
      verified = { identity: { id: claims.sub, aal: claims.aal }, sessionId: claims.session_id }
    } catch {
      // Discard provider errors; they can contain tokens or request details.
      throw new UnauthorizedException('Invalid or expired authentication. Sign in again.')
    }
    // Keep infrastructure failures as sanitized 503s. An unexpired signed JWT
    // must not bypass a committed session removal, missing helper or DB outage.
    await this.sessions.assertLive(verified.identity.id, verified.sessionId)
    return verified.identity
  }
}
