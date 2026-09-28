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
