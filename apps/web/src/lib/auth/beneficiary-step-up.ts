import { getVerifiedTotpFactors, isTotpCode, verifyTotpCode } from '@/features/auth/mfa-flow'
import { PathwaysClientError, requestFoundation } from '@/lib/services/pathways-client'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'

export type StepUpPinState = 'NONE' | 'SET' | 'LOCKED'

interface BeneficiaryStepUpStatus {
  fresh: boolean
  expiresAt: string | null
  /** How the current step-up was satisfied, if it is fresh. */
  method: 'TOTP' | 'PIN' | null
  pinState: StepUpPinState
}

export class BeneficiaryStepUpError extends Error {
  constructor(
    message: string,
    readonly failure: 'rejected' | 'unavailable' | 'locked' | 'throttled',
  ) {
    super(message)
    this.name = 'BeneficiaryStepUpError'
  }
}

const UNAVAILABLE = 'The verification service could not be reached.'
export const PIN_LOCKED_MESSAGE = 'PIN locked. Use your authenticator to unlock it.'
export const PIN_RULE_MESSAGE =
  'Use 6 to 12 digits. Repeated digits and simple ascending or descending sequences are not accepted.'

/** Mirrors the server rule (cr-pathways-beneficiary-step-up-pin); the server decides. */
export function isAcceptableStepUpPin(pin: string) {
  if (!/^[0-9]{6,12}$/.test(pin)) return false
  const steps = [...pin.slice(1)].map((digit, index) => digit.charCodeAt(0) - pin.charCodeAt(index))
  return ![0, 1, -1].some((run) => steps.every((step) => step === run))
}

/** Server-derived freshness and PIN state; never cached or stored in the browser. */
export async function getBeneficiaryStepUpStatus(
  signal?: AbortSignal,
): Promise<BeneficiaryStepUpStatus> {
  const body = (await requestFoundation('/auth/step-up/status', { signal })) as unknown
  const value = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const method = value.method ?? null
  const pinState = value.pinState ?? 'NONE'
  if (
    typeof value.fresh !== 'boolean' ||
    !(value.expiresAt === null || typeof value.expiresAt === 'string') ||
    !(method === null || method === 'TOTP' || method === 'PIN') ||
    !(pinState === 'NONE' || pinState === 'SET' || pinState === 'LOCKED')
  ) {
    throw new PathwaysClientError('Invalid step-up status.', 'network')
  }
  return {
    fresh: value.fresh,
    expiresAt: value.expiresAt,
    method: value.fresh ? method : null,
    pinState,
  }
}

/** Re-verify the enrolled authenticator in the browser session; the API must then confirm it. */
async function reverifyAuthenticator(code: string) {
  if (!isTotpCode(code)) {
    throw new BeneficiaryStepUpError('Enter the six digits from your authenticator.', 'rejected')
  }
  const supabase = getBrowserSupabaseClient()
  if (!supabase) {
    throw new BeneficiaryStepUpError('Authentication is not configured.', 'unavailable')
  }
  const initial = await supabase.auth.getSession()
  const subject = initial.data.session?.user.id
  if (initial.error || !subject) {
    throw new BeneficiaryStepUpError('Your session changed. Sign in again.', 'unavailable')
  }
  const factors = await supabase.auth.mfa.listFactors()
  if (factors.error) {
    throw new BeneficiaryStepUpError(UNAVAILABLE, 'unavailable')
  }
  const factorId = getVerifiedTotpFactors(factors.data.all)[0]?.id
  if (!factorId) {
    throw new BeneficiaryStepUpError('No verified authenticator is enrolled.', 'unavailable')
  }
  try {
    await verifyTotpCode(supabase.auth.mfa, factorId, code, async () => {
      const current = await supabase.auth.getSession()
      if (current.error || current.data.session?.user.id !== subject) {
        throw new Error('Session changed.')
      }
    })
  } catch (error) {
    // verifyTotpCode's only code-rejection message; challenge/session failures are outages.
    const rejected = error instanceof Error && error.message.startsWith('The code was not accepted')
    throw new BeneficiaryStepUpError(
      rejected ? 'The code was not accepted.' : UNAVAILABLE,
      rejected ? 'rejected' : 'unavailable',
    )
  }
}

async function confirmedStatus() {
  try {
    return await getBeneficiaryStepUpStatus()
  } catch {
    throw new BeneficiaryStepUpError(UNAVAILABLE, 'unavailable')
  }
}

/**
 * Re-verify the enrolled authenticator, then require the API to confirm a fresh TOTP.
 * Returns the server status so the caller can unlock or offer a PIN.
 */
export async function verifyBeneficiaryStepUp(code: string): Promise<BeneficiaryStepUpStatus> {
  await reverifyAuthenticator(code)
  const status = await confirmedStatus()
  // A client-side verify success alone never opens Beneficiary detail.
  if (!status.fresh || status.method !== 'TOTP') {
    throw new BeneficiaryStepUpError('The code was not accepted.', 'rejected')
  }
  return status
}

const TOTP_FIRST = 'Verify with your authenticator first.'

// requestFoundation exposes status, not the server code, for 403/409; each call names
// what those statuses mean for its endpoint. A locked PIN is confirmed from server status.
async function postPin(
  path: string,
  body: Record<string, string> | undefined,
  meaning: { forbidden: string; conflict: string },
) {
  try {
    return (await requestFoundation(path, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    })) as unknown
  } catch (error) {
    if (!(error instanceof PathwaysClientError)) {
      throw new BeneficiaryStepUpError(UNAVAILABLE, 'unavailable')
    }
    if (error.status === 429) {
      throw new BeneficiaryStepUpError(
        'Too many PIN attempts. Wait a minute and try again.',
        'throttled',
      )
    }
    if (error.status === 400) throw new BeneficiaryStepUpError(PIN_RULE_MESSAGE, 'rejected')
    if (error.status === 403 || error.status === 409) {
      const status = await getBeneficiaryStepUpStatus().catch(() => null)
      if (status?.pinState === 'LOCKED') {
        throw new BeneficiaryStepUpError(PIN_LOCKED_MESSAGE, 'locked')
      }
      throw new BeneficiaryStepUpError(
        error.status === 403 ? meaning.forbidden : meaning.conflict,
        'rejected',
      )
    }
    throw new BeneficiaryStepUpError(UNAVAILABLE, 'unavailable')
  }
}

/** Verify the PIN (JSON body only); the API then must report a fresh PIN step-up. */
export async function verifyStepUpPin(pin: string): Promise<BeneficiaryStepUpStatus> {
  if (!/^[0-9]{6,12}$/.test(pin)) {
    throw new BeneficiaryStepUpError('Enter your 6 to 12 digit PIN.', 'rejected')
  }
  await postPin(
    '/auth/step-up/pin',
    { pin },
    { forbidden: 'Incorrect PIN', conflict: 'No PIN is set. Use your authenticator.' },
  )
  const status = await confirmedStatus()
  if (!status.fresh) throw new BeneficiaryStepUpError('Incorrect PIN', 'rejected')
  return status
}

/** Set a first PIN. The server requires a fresh TOTP from signed claims. */
export async function setStepUpPin(pin: string) {
  if (!isAcceptableStepUpPin(pin)) throw new BeneficiaryStepUpError(PIN_RULE_MESSAGE, 'rejected')
  await postPin(
    '/auth/step-up/pin/setup',
    { pin },
    { forbidden: TOTP_FIRST, conflict: 'A PIN is already set. Change it in My Profile.' },
  )
}

/** Change the PIN with the current PIN, or with a fresh authenticator code. */
export async function changeStepUpPin(
  newPin: string,
  proof: { currentPin: string } | { authenticatorCode: string },
) {
  if (!isAcceptableStepUpPin(newPin)) {
    throw new BeneficiaryStepUpError(PIN_RULE_MESSAGE, 'rejected')
  }
  if ('authenticatorCode' in proof) {
    await reverifyAuthenticator(proof.authenticatorCode)
    await postPin(
      '/auth/step-up/pin/change',
      { newPin },
      { forbidden: TOTP_FIRST, conflict: 'No PIN is set yet.' },
    )
    return
  }
  if (!/^[0-9]{6,12}$/.test(proof.currentPin)) {
    throw new BeneficiaryStepUpError('Enter your current 6 to 12 digit PIN.', 'rejected')
  }
  await postPin(
    '/auth/step-up/pin/change',
    { newPin, currentPin: proof.currentPin },
    { forbidden: 'Incorrect PIN', conflict: 'No PIN is set yet.' },
  )
}

/** After a fresh TOTP step-up, clear a PIN lock. The server checks the TOTP is newer. */
export async function unlockStepUpPin() {
  await postPin('/auth/step-up/pin/unlock', undefined, {
    forbidden: TOTP_FIRST,
    conflict: 'No PIN is set yet.',
  })
}
