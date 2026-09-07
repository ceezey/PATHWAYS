import type { SupabaseClient } from '@supabase/supabase-js'

interface TotpFactor {
  id: string
  factor_type: string
  status: string
}

export const getVerifiedTotpFactors = <T extends TotpFactor>(factors: readonly T[]): T[] =>
  factors.filter((factor) => factor.factor_type === 'totp' && factor.status === 'verified')

export const isTotpCode = (code: string) => /^\d{6}$/.test(code)

export const getQrImageSource = (qr: string): string => {
  // No HTML injection, remote QR renderer, otpauth URI, or manual secret fallback.
  if (qr.startsWith('data:image/svg+xml;utf-8,')) return qr
  if (qr.trimStart().startsWith('<svg')) {
    return `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`
  }
  throw new Error('The private authenticator QR code could not be displayed.')
}

export async function verifyTotpCode(
  mfa: Pick<SupabaseClient['auth']['mfa'], 'challenge' | 'verify'>,
  factorId: string,
  code: string,
  assertCurrentSession: () => Promise<void>,
) {
  if (!factorId || !isTotpCode(code))
    throw new Error('Enter the six digits from your authenticator.')
  await assertCurrentSession()
  const challenge = await mfa.challenge({ factorId })
  if (challenge.error) throw new Error('Could not start verification. Please try again.')
  await assertCurrentSession()
  const result = await mfa.verify({ factorId, challengeId: challenge.data.id, code })
  if (result.error) throw new Error('The code was not accepted. Try the next authenticator code.')
  // The caller must re-check the API's verified aal2 status; a client success
  // alone is not proof of authorized application access.
}
