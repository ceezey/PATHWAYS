// Approved step-up contract: cr-pathways-beneficiary-step-up (Option A).
// Freshness is derived only from the verified signed `amr` TOTP timestamp.
export const STEP_UP_WINDOW_SECONDS = 15 * 60
const STEP_UP_CLOCK_SKEW_SECONDS = 30

type BeneficiaryStepUpState =
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

// PIN fallback codes (cr-pathways-beneficiary-step-up-pin); the PIN rule itself lives in @pathways/shared.
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
