import * as Sentry from '@sentry/nestjs'

import { readApiEnv } from '@pathways/config'

let initialized = false

// Request bodies (for example a step-up PIN), cookies and headers never leave the API.
export const redactSentryRequest = <T extends Sentry.ErrorEvent>(event: T): T => {
  if (event.request) {
    const {
      data: _data,
      cookies: _cookies,
      headers: _headers,
      query_string: _query,
      ...rest
    } = event.request
    event.request = rest
  }
  return event
}

export const initializeApiSentry = () => {
  const env = readApiEnv(process.env)

  if (!env.SENTRY_DSN_API || initialized) {
    return false
  }

  Sentry.init({
    dsn: env.SENTRY_DSN_API,
    tracesSampleRate: 0,
    beforeSend: redactSentryRequest,
  })

  initialized = true

  return true
}
