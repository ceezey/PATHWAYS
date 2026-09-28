import { getVerifiedTotpFactors, isTotpCode, verifyTotpCode } from '@/features/auth/mfa-flow'
import { PathwaysClientError, requestFoundation } from '@/lib/services/pathways-client'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'

export interface BeneficiaryStepUpStatus {
  fresh: boolean
  expiresAt: string | null
}

export class BeneficiaryStepUpError extends Error {
  constructor(
    message: string,
    readonly failure: 'rejected' | 'unavailable',
  ) {
    super(message)
    this.name = 'BeneficiaryStepUpError'
  }
}

/** Server-derived freshness from signed claims; never cached or stored in the browser. */
export async function getBeneficiaryStepUpStatus(
  signal?: AbortSignal,
): Promise<BeneficiaryStepUpStatus> {
  const body = (await requestFoundation('/auth/step-up/status', { signal })) as unknown
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { fresh?: unknown }).fresh !== 'boolean' ||
    !(
      (body as { expiresAt?: unknown }).expiresAt === null ||
      typeof (body as { expiresAt?: unknown }).expiresAt === 'string'
    )
  ) {
    throw new PathwaysClientError('Invalid step-up status.', 'network')
  }
  const { fresh, expiresAt } = body as BeneficiaryStepUpStatus
  return { fresh, expiresAt }
}

/** Re-verify the enrolled authenticator, then require the API to confirm freshness. */
export async function verifyBeneficiaryStepUp(code: string): Promise<void> {
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
    throw new BeneficiaryStepUpError(
      'The verification service could not be reached.',
      'unavailable',
    )
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
      rejected ? 'The code was not accepted.' : 'The verification service could not be reached.',
      rejected ? 'rejected' : 'unavailable',
    )
  }
  let status: BeneficiaryStepUpStatus
  try {
    status = await getBeneficiaryStepUpStatus()
  } catch {
    throw new BeneficiaryStepUpError(
      'The verification service could not be reached.',
      'unavailable',
    )
  }
  // A client-side verify success alone never opens Beneficiary detail.
  if (!status.fresh) {
    throw new BeneficiaryStepUpError('The code was not accepted.', 'rejected')
  }
}
