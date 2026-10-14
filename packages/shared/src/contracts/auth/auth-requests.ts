import { z } from 'zod'

import { lengthString } from '../common/field-schemas'

const pinText = lengthString(0, 32)

// Body of POST auth/sign-in; the API adds the class-validator email rule, and the password is never logged or echoed.
export const signInRequest = z
  .object({ email: lengthString(0, 254), password: lengthString(1, 1024) })
  .strict()
export type SignInRequest = z.infer<typeof signInRequest>

// Body of POST auth/step-up/pin and pin/setup; digit and pattern rules stay in the service and the database.
export const verifyStepUpPinRequest = z.object({ pin: pinText }).strict()
export type VerifyStepUpPinRequest = z.infer<typeof verifyStepUpPinRequest>

// Body of POST auth/step-up/pin/change; an absent currentPin selects the authenticator path.
export const changeStepUpPinRequest = z
  .object({ newPin: pinText, currentPin: pinText.nullish() })
  .strict()
export type ChangeStepUpPinRequest = z.infer<typeof changeStepUpPinRequest>
