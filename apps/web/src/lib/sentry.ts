import { webSetupState } from '@/lib/env'

let initialized = false

export const initializeWebSentry = () => {
  if (!webSetupState.sentryEnabled || initialized) {
    return false
  }

  initialized = true

  return true
}
