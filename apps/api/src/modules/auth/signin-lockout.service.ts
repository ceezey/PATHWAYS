import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'

import { isApprovedServiceProtocol } from '@pathways/config'
import { PrismaService } from '../../prisma/prisma.service'

const SIGN_IN_LOCKED_CODE = 'SIGN_IN_LOCKED'
const INVALID_MESSAGE = 'Could not sign in. Check your credentials and try again.'

/** Same response for known and unknown accounts, so lockout never reveals existence. */
const signInLocked = (seconds: number) =>
  new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      code: SIGN_IN_LOCKED_CODE,
      message: 'Too many failed sign-in attempts. Try again in 15 minutes.',
      retryAfterSeconds: seconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  )

export interface PasswordGrant {
  session: { accessToken: string; refreshToken: string } | null
  // True only for a definite credential rejection, never for an outage or provider rate limit.
  rejected: boolean
}

// Password grant against the identity provider; nothing is logged or returned beyond the session.
export async function passwordGrant(email: string, password: string): Promise<PasswordGrant> {
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  let origin: string
  try {
    const configured = new URL(url ?? '')
    if (!isApprovedServiceProtocol(configured) || configured.username || configured.password)
      throw new Error()
    origin = configured.origin
  } catch {
    throw new ServiceUnavailableException('Authentication is not configured.')
  }
  if (!key) throw new ServiceUnavailableException('Authentication is not configured.')
  const supabase = createClient(origin, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  })
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (data.session) {
      return {
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
        rejected: false,
      }
    }
    const status = error?.status ?? 0
    return { session: null, rejected: status >= 400 && status < 500 && status !== 429 }
  } catch {
    return { session: null, rejected: false }
  }
}

@Injectable()
export class SignInLockoutService {
  // Replaceable in tests so no identity provider is contacted.
  grant: typeof passwordGrant = passwordGrant

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async signIn(rawEmail: string, password: string) {
    const email = rawEmail.trim().toLowerCase()
    const remaining = await this.db(
      () => this.prisma.$queryRaw<Array<{ s: unknown }>>`
        SELECT pathways.signin_lockout_remaining(${email}::text) AS s`,
    )
    // Locked identifiers are refused without checking the password.
    if (remaining > 0) throw signInLocked(remaining)
    const result = await this.grant(email, password)
    if (result.session) {
      await this.db(
        () => this.prisma.$queryRaw<Array<{ s: unknown }>>`
          SELECT 0 AS s FROM (SELECT pathways.signin_lockout_reset(${email}::text)) r`,
      )
      return result.session
    }
    if (!result.rejected) throw new ServiceUnavailableException('Authentication is unavailable.')
    const locked = await this.db(
      () => this.prisma.$queryRaw<Array<{ s: unknown }>>`
        SELECT pathways.signin_lockout_failure(${email}::text) AS s`,
    )
    if (locked > 0) throw signInLocked(locked)
    throw new UnauthorizedException(INVALID_MESSAGE)
  }

  // Database errors can carry parameters, so they are collapsed to a fixed outage message.
  private async db(query: () => Promise<Array<{ s: unknown }>>): Promise<number> {
    try {
      const [row] = await query()
      return Number(row?.s ?? 0)
    } catch {
      throw new ServiceUnavailableException('Authentication is unavailable.')
    }
  }
}
