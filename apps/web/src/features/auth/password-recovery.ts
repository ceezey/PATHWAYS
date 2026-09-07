import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const localPasswordRecoveryOrigin = 'http://127.0.0.1:3000'
export const passwordRecoveryCallbackPath = '/auth/recovery/callback'
export const passwordRecoveryCallbackUrl = `${localPasswordRecoveryOrigin}${passwordRecoveryCallbackPath}`
export const passwordRecoveryRequestPath = '/staff/forgot-password'
export const passwordRecoveryRequestUrl = `${localPasswordRecoveryOrigin}${passwordRecoveryRequestPath}`
export const passwordUpdatePath = '/auth/update-password'
export const passwordRecoveryCompletePath = '/auth/recovery/complete'

export const passwordRecoveryAcknowledgement =
  'If this email belongs to the approved account, a password recovery message has been sent.'

export const passwordRecoveryRequestSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
})

const strongPassword = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use no more than 128 characters.')
  .regex(/[a-z]/, 'Add at least one lowercase letter.')
  .regex(/[A-Z]/, 'Add at least one uppercase letter.')
  .regex(/[0-9]/, 'Add at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Add at least one symbol.')

export const passwordUpdateSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  })

export const passwordUpdateRequestSchema = z
  .object({
    password: strongPassword,
  })
  .strict()

export type PasswordRecoveryRequest = z.infer<typeof passwordRecoveryRequestSchema>
export type PasswordUpdate = z.infer<typeof passwordUpdateSchema>

export type PasswordCompletionUiOutcome =
  | { kind: 'success'; sessionClosed: boolean }
  | { kind: 'unchanged' }
  | { kind: 'unknown' }

export const classifyPasswordCompletionResult = (
  responseOk: boolean,
  value: unknown,
): PasswordCompletionUiOutcome => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'unknown' }
  const result = value as Record<string, unknown>
  if (responseOk && result.ok === true && typeof result.sessionClosed === 'boolean') {
    return { kind: 'success', sessionClosed: result.sessionClosed }
  }
  if (
    !responseOk &&
    result.ok === false &&
    typeof result.outcome === 'string' &&
    ['invalid', 'not_changed', 'unauthorized'].includes(result.outcome)
  ) {
    return { kind: 'unchanged' }
  }
  return { kind: 'unknown' }
}

type PasswordRecoveryAuth = Pick<SupabaseClient['auth'], 'resetPasswordForEmail'>

export const isApprovedPasswordRecoveryOrigin = (origin: string) =>
  origin === localPasswordRecoveryOrigin

export async function requestPasswordRecoveryEmail(
  auth: PasswordRecoveryAuth,
  email: string,
  currentOrigin: string,
): Promise<string> {
  if (!isApprovedPasswordRecoveryOrigin(currentOrigin)) {
    return passwordRecoveryAcknowledgement
  }

  try {
    // Supabase deliberately returns the same result when an account does not exist.
    // Keep provider and delivery errors generic here as well to prevent enumeration.
    await auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordRecoveryCallbackUrl,
    })
  } catch {
    // The person sees the same acknowledgement for provider, network, and unknown-user cases.
  }

  return passwordRecoveryAcknowledgement
}
