import * as Sentry from '@sentry/nestjs'

import { readApiEnv } from '@pathways/config'

let initialized = false

export const initializeApiSentry = () => {
  const env = readApiEnv(process.env)

  if (!env.SENTRY_DSN_API || initialized) {
    return false
  }

  Sentry.init({
    dsn: env.SENTRY_DSN_API,
    tracesSampleRate: 0,
  })

  initialized = true

  return true
}
