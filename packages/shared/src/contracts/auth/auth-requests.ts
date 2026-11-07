import { z } from 'zod'

import { lengthString } from '../common/field-schemas'

const pinText = lengthString(0, 32)

// Body of POST auth/sign-in; the API adds the class-validator email rule, and the password is never logged or echoed.
export const signInRequest = z
  .object({ email: lengthString(0, 254), password: lengthString(1, 1024) })
  .strict()
export type SignInRequest = z.infer<typeof signInRequest>

// The staff password rule, shared by the web form and the API.
export const strongPassword = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use no more than 128 characters.')
  .regex(/[a-z]/, 'Add at least one lowercase letter.')
  .regex(/[A-Z]/, 'Add at least one uppercase letter.')
  .regex(/[0-9]/, 'Add at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Add at least one symbol.')

// A password may be set only this long after the recovery or invite link was opened.
export const passwordRecoveryWindowSeconds = 10 * 60

// True when Auth-signed amr shows a recovery or invite sign-in inside the window, allowing 60 seconds of clock skew.
export const hasRecentRecoverySignIn = (amr: unknown, now = Date.now()) => {
  const nowSeconds = now / 1000
  return (
    Array.isArray(amr) &&
    amr.some((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
      const { method, timestamp } = entry as Record<string, unknown>
      return (
        (method === 'recovery' || method === 'invite') &&
        typeof timestamp === 'number' &&
        timestamp <= nowSeconds + 60 &&
        nowSeconds - timestamp < passwordRecoveryWindowSeconds
      )
    })
  )
}

// Body of POST auth/password-recovery/complete; the password is never logged or echoed.
export const passwordRecoveryCompleteRequest = z.object({ password: strongPassword }).strict()
export type PasswordRecoveryCompleteRequest = z.infer<typeof passwordRecoveryCompleteRequest>

// Body of POST auth/step-up/pin and pin/setup; digit and pattern rules stay in the service and the database.
export const verifyStepUpPinRequest = z.object({ pin: pinText }).strict()
export type VerifyStepUpPinRequest = z.infer<typeof verifyStepUpPinRequest>

// Body of POST auth/step-up/pin/change; an absent currentPin selects the authenticator path.
export const changeStepUpPinRequest = z
  .object({ newPin: pinText, currentPin: pinText.nullish() })
  .strict()
export type ChangeStepUpPinRequest = z.infer<typeof changeStepUpPinRequest>
