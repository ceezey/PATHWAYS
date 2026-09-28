import * as Sentry from '@sentry/nestjs'

import { readApiEnv } from '@pathways/config'

let initialized = false

// Strips everything from the first `?` or `#` onward, so query values (for
// example a step-up PIN or a Beneficiary search term) never leave the API.
const truncateAtQueryOrFragment = (url: string): string => {
  const match = /[?#]/.exec(url)
  return match ? url.slice(0, match.index) : url
}

const redactBreadcrumbUrlField = (
  data: Record<string, unknown>,
  field: 'url' | 'to' | 'from',
): void => {
  const value = data[field]
  if (typeof value === 'string') {
    data[field] = truncateAtQueryOrFragment(value)
  }
}

// Request bodies (for example a step-up PIN), cookies, headers and query
// strings never leave the API. `request.url` on @sentry/core is the absolute
// URL including the query string, so it is truncated rather than dropped.
export const redactSentryRequest = <T extends Sentry.ErrorEvent>(event: T): T => {
  if (event.request) {
    const {
      data: _data,
      cookies: _cookies,
      headers: _headers,
      query_string: _query,
      env: _env,
      url,
      ...rest
    } = event.request
    event.request = {
      ...rest,
      ...(url === undefined ? {} : { url: truncateAtQueryOrFragment(url) }),
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
      if (!breadcrumb.data) {
        return breadcrumb
      }
      const data = { ...breadcrumb.data }
      redactBreadcrumbUrlField(data, 'url')
      redactBreadcrumbUrlField(data, 'to')
      redactBreadcrumbUrlField(data, 'from')
      return { ...breadcrumb, data }
    })
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
