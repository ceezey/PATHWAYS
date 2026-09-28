// Approved step-up contract: cr-pathways-beneficiary-step-up (Option A).
// Freshness is derived only from the verified signed `amr` TOTP timestamp.
export const STEP_UP_WINDOW_SECONDS = 15 * 60
export const STEP_UP_CLOCK_SKEW_SECONDS = 30
export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED'

export type BeneficiaryStepUpState =
  | { fresh: true; verifiedAt: number; expiresAt: number }
  | { fresh: false; reason: 'MISSING' | 'STALE' }

export function evaluateBeneficiaryStepUp(
  mfaVerifiedAt: number | undefined,
  now = Date.now() / 1000,
): BeneficiaryStepUpState {
  if (
    mfaVerifiedAt === undefined ||
    !Number.isFinite(mfaVerifiedAt) ||
    mfaVerifiedAt > now + STEP_UP_CLOCK_SKEW_SECONDS
  ) {
    return { fresh: false, reason: 'MISSING' }
  }
  if (now - mfaVerifiedAt > STEP_UP_WINDOW_SECONDS) return { fresh: false, reason: 'STALE' }
  return {
    fresh: true,
    verifiedAt: mfaVerifiedAt,
    expiresAt: mfaVerifiedAt + STEP_UP_WINDOW_SECONDS,
  }
}

// Approved PIN fallback: cr-pathways-beneficiary-step-up-pin. TOTP stays primary; a PIN
// grant is bound to user, organization and verified session and expires 15 minutes after
// verification. These rules mirror pathways.step_up_pin_acceptable (migration 0037).
export const STEP_UP_PIN_PATTERN = /^[0-9]{6,12}$/
export type StepUpPinState = 'NONE' | 'SET' | 'LOCKED'
export type StepUpMethod = 'TOTP' | 'PIN'

export const STEP_UP_PIN_CODES = {
  invalid: 'STEP_UP_PIN_INVALID',
  incorrect: 'STEP_UP_PIN_INCORRECT',
  locked: 'STEP_UP_PIN_LOCKED',
  notSet: 'STEP_UP_PIN_NOT_SET',
  exists: 'STEP_UP_PIN_EXISTS',
  totpRequired: 'STEP_UP_TOTP_REQUIRED',
  throttled: 'STEP_UP_PIN_THROTTLED',
} as const

/** 6-12 ASCII digits, rejecting all-identical digits and strictly ascending/descending runs. */
export function isAcceptableStepUpPin(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string' || !STEP_UP_PIN_PATTERN.test(candidate)) return false
  const steps = [...candidate.slice(1)].map(
    (digit, index) => digit.charCodeAt(0) - candidate.charCodeAt(index),
  )
  return ![0, 1, -1].some((run) => steps.every((step) => step === run))
}
