import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { InactiveVerifiedSessionError, PrismaService } from '../../prisma/prisma.service'
import {
  STEP_UP_PIN_CODES,
  STEP_UP_PIN_PATTERN,
  STEP_UP_WINDOW_SECONDS,
  type StepUpMethod,
  type StepUpPinState,
  evaluateBeneficiaryStepUp,
  isAcceptableStepUpPin,
} from './beneficiary-step-up'
import {
  type ApplicationIdentity,
  UUID_PATTERN,
  type VerifiedAuthIdentity,
} from './developer-access'

// cr-pathways-beneficiary-step-up-pin. The PIN travels only as a bound query parameter into
// the 0037 SECURITY DEFINER functions; it is never logged, audited, echoed or cached. Every
// call runs in a verified context that rechecks session liveness in the same transaction.
const PIN_STATES: readonly StepUpPinState[] = ['NONE', 'SET', 'LOCKED']
const THROTTLE_WINDOW_MS = 60_000
const THROTTLE_LIMIT = 10
const MAX_THROTTLED_USERS = 2_048

const denial = (status: HttpStatus, code: string, message: string) =>
  new HttpException(
    {
      statusCode: status,
      error:
        status === HttpStatus.FORBIDDEN
          ? 'Forbidden'
          : status === HttpStatus.CONFLICT
            ? 'Conflict'
            : status === HttpStatus.BAD_REQUEST
              ? 'Bad Request'
              : 'Too Many Requests',
      code,
      message,
    },
    status,
  )

const PIN_RULE =
  'Use 6 to 12 digits. Repeated digits and simple ascending or descending sequences are not accepted.'
// Runtime shape check as well as the DTO: a JSON number must never reach the database.
const isPinShape = (value: unknown): value is string =>
  typeof value === 'string' && STEP_UP_PIN_PATTERN.test(value)
const incorrectPin = () =>
  denial(HttpStatus.FORBIDDEN, STEP_UP_PIN_CODES.incorrect, 'Incorrect PIN')
const lockedPin = () =>
  denial(
    HttpStatus.CONFLICT,
    STEP_UP_PIN_CODES.locked,
    'PIN locked. Use your authenticator to unlock it.',
  )
const notSet = () => denial(HttpStatus.CONFLICT, STEP_UP_PIN_CODES.notSet, 'No PIN is set.')
const totpRequired = () =>
  denial(
    HttpStatus.FORBIDDEN,
    STEP_UP_PIN_CODES.totpRequired,
    'Verify with your authenticator first.',
  )

/** Server-derived identity for PIN operations; never read from the request body. */
export interface StepUpPinActor {
  /** Verified token identity; its signed TOTP `amr` timestamp is the only TOTP evidence. */
  auth: VerifiedAuthIdentity
  profile: ApplicationIdentity
  sessionId: string
}

/** Live PIN grant for this user, organization and session, read inside a verified context. */
export async function readStepUpPinStatus(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<{ pinState: StepUpPinState; grantExpiresAt: Date | null }> {
  const rows = await tx.$queryRaw<Array<{ pinState: unknown; grantExpiresAt: unknown }>>`
    SELECT pin_state AS "pinState", grant_expires_at AS "grantExpiresAt"
    FROM pathways.step_up_pin_status(${sessionId}::uuid)`
  const row = rows.length === 1 ? rows[0] : undefined
  if (
    !row ||
    !PIN_STATES.includes(row.pinState as StepUpPinState) ||
    !(row.grantExpiresAt === null || row.grantExpiresAt instanceof Date)
  ) {
    throw new Error('Invalid step-up PIN status.')
  }
  return { pinState: row.pinState as StepUpPinState, grantExpiresAt: row.grantExpiresAt }
}

@Injectable()
export class BeneficiaryStepUpPinService {
  private readonly attempts = new Map<string, { windowStart: number; count: number }>()

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async status(actor: StepUpPinActor) {
    const totp = evaluateBeneficiaryStepUp(actor.auth.mfaVerifiedAt)
    const { pinState, grantExpiresAt } = await this.run(actor, (tx) =>
      readStepUpPinStatus(tx, actor.sessionId),
    )
    const method: StepUpMethod | null = totp.fresh ? 'TOTP' : grantExpiresAt ? 'PIN' : null
    return {
      fresh: method !== null,
      expiresAt: totp.fresh
        ? new Date(totp.expiresAt * 1000).toISOString()
        : (grantExpiresAt?.toISOString() ?? null),
      windowSeconds: STEP_UP_WINDOW_SECONDS,
      method,
      pinState,
    }
  }

  async verify(actor: StepUpPinActor, pin: unknown) {
    this.throttle(actor.profile)
    if (!isPinShape(pin)) {
      throw denial(
        HttpStatus.BAD_REQUEST,
        STEP_UP_PIN_CODES.invalid,
        'Enter your 6 to 12 digit PIN.',
      )
    }
    const [row] = await this.run(
      actor,
      (tx) => tx.$queryRaw<Array<{ outcome: string; expiresAt: Date | null }>>`
        SELECT outcome, expires_at AS "expiresAt"
        FROM pathways.step_up_pin_verify(${pin}::text, ${actor.sessionId}::uuid)`,
    )
    if (row?.outcome === 'ACCEPTED' && row.expiresAt instanceof Date) {
      return { verified: true, method: 'PIN' as const, expiresAt: row.expiresAt.toISOString() }
    }
    throw this.outcomeError(row?.outcome)
  }

  async setup(actor: StepUpPinActor, pin: unknown) {
    this.throttle(actor.profile)
    const totpAt = this.freshTotp(actor.auth)
    this.assertAcceptable(pin)
    const [row] = await this.run(
      actor,
      (tx) => tx.$queryRaw<Array<{ outcome: string }>>`
        SELECT pathways.step_up_pin_set(${pin}::text, ${totpAt}::timestamptz) AS outcome`,
    )
    if (row?.outcome === 'SET') return { pinState: 'SET' as const }
    throw this.outcomeError(row?.outcome)
  }

  async change(actor: StepUpPinActor, newPin: unknown, currentPin: unknown) {
    this.throttle(actor.profile)
    this.assertAcceptable(newPin)
    // A supplied current PIN is the proof, even if a TOTP is also fresh; otherwise TOTP.
    let totpAt: Date | null = null
    if (currentPin === undefined) totpAt = this.freshTotp(actor.auth)
    else if (!isPinShape(currentPin)) {
      throw denial(
        HttpStatus.BAD_REQUEST,
        STEP_UP_PIN_CODES.invalid,
        'Enter your current 6 to 12 digit PIN.',
      )
    }
    const [row] = await this.run(
      actor,
      (tx) => tx.$queryRaw<Array<{ outcome: string }>>`
        SELECT pathways.step_up_pin_change(${newPin}::text, ${currentPin ?? null}::text,
          ${totpAt}::timestamptz) AS outcome`,
    )
    if (row?.outcome === 'CHANGED') return { pinState: 'SET' as const }
    throw this.outcomeError(row?.outcome)
  }

  async unlock(actor: StepUpPinActor) {
    this.throttle(actor.profile)
    const totpAt = this.freshTotp(actor.auth)
    const [row] = await this.run(
      actor,
      (tx) => tx.$queryRaw<Array<{ outcome: string }>>`
        SELECT pathways.step_up_pin_unlock(${totpAt}::timestamptz) AS outcome`,
    )
    if (row?.outcome === 'UNLOCKED' || row?.outcome === 'SET') return { pinState: 'SET' as const }
    throw this.outcomeError(row?.outcome)
  }

  private assertAcceptable(pin: unknown): asserts pin is string {
    if (!isAcceptableStepUpPin(pin)) {
      throw denial(HttpStatus.BAD_REQUEST, STEP_UP_PIN_CODES.invalid, PIN_RULE)
    }
  }

  // The database cannot verify a TOTP claim; this asserts it from verified signed claims.
  private freshTotp(identity: VerifiedAuthIdentity) {
    const totp = evaluateBeneficiaryStepUp(identity.mfaVerifiedAt)
    if (!totp.fresh) throw totpRequired()
    return new Date(totp.verifiedAt * 1000)
  }

  private outcomeError(outcome: string | undefined) {
    switch (outcome) {
      case 'INCORRECT':
        return incorrectPin()
      case 'LOCKED':
        return lockedPin()
      case 'NOT_SET':
        return notSet()
      case 'EXISTS':
        return denial(HttpStatus.CONFLICT, STEP_UP_PIN_CODES.exists, 'A PIN is already set.')
      case 'TOTP_REQUIRED':
        return totpRequired()
      default:
        return new ServiceUnavailableException('Step-up PIN service is unavailable.')
    }
  }

  // Best-effort per-instance throttle in front of the database lockout, which is the bound.
  private throttle(identity: ApplicationIdentity) {
    const key = `${identity.organizationId}:${identity.userId}`
    const now = Date.now()
    const entry = this.attempts.get(key)
    if (!entry || now - entry.windowStart >= THROTTLE_WINDOW_MS) {
      this.attempts.delete(key)
      if (this.attempts.size >= MAX_THROTTLED_USERS) {
        const oldest = this.attempts.keys().next().value
        if (oldest !== undefined) this.attempts.delete(oldest)
      }
      this.attempts.set(key, { windowStart: now, count: 1 })
      return
    }
    entry.count += 1
    if (entry.count > THROTTLE_LIMIT) {
      throw denial(
        HttpStatus.TOO_MANY_REQUESTS,
        STEP_UP_PIN_CODES.throttled,
        'Too many PIN requests. Wait a minute and try again.',
      )
    }
  }

  private async run<T>(
    { auth, profile, sessionId }: StepUpPinActor,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!UUID_PATTERN.test(sessionId) || auth.id !== profile.id) {
      throw new UnauthorizedException('Verified session required.')
    }
    try {
      return await this.prisma.withVerifiedContext(
        {
          authSubject: auth.id,
          organizationId: profile.organizationId,
          userId: profile.userId,
          sessionId,
        },
        work,
      )
    } catch (error) {
      if (error instanceof InactiveVerifiedSessionError) {
        throw new UnauthorizedException('Invalid or expired authentication. Sign in again.')
      }
      // Sanitized: database errors can carry parameters, so none are forwarded or logged.
      if (error instanceof HttpException) throw error
      throw new ServiceUnavailableException('Step-up PIN service is unavailable.')
    }
  }
}
