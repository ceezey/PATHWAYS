import { SetMetadata } from '@nestjs/common'

export const TOTP_STEP_UP_KEY = 'pathways:totp-step-up'
/** Handlers that need a fresh authenticator code; a PIN grant does not count. */
export const RequireTotpStepUp = () => SetMetadata(TOTP_STEP_UP_KEY, true)
