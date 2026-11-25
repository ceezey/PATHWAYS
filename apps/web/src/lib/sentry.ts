import type { Breadcrumb, BrowserOptions, ErrorEvent } from '@sentry/nextjs'

// Queries can carry recovery codes and identifiers, so no reported URL keeps one.
const withoutQuery = (url: unknown) => (typeof url === 'string' ? url.split(/[?#]/)[0] : url)

const scrubData = (data: Breadcrumb['data']) =>
  data &&
  Object.fromEntries(
    Object.entries(data).map(([key, value]) =>
      ['url', 'from', 'to'].includes(key) ? [key, withoutQuery(value)] : [key, value],
    ),
  )

/** Drops the query from a breadcrumb's addresses before it is kept. */
export const scrubWebBreadcrumb = (crumb: Breadcrumb): Breadcrumb => ({
  ...crumb,
  data: scrubData(crumb.data),
})

/** Keeps only the error and the page address without its query: no user, body, cookies or headers. */
export const scrubWebEvent = (event: ErrorEvent): ErrorEvent => {
  const { user: _user, request, breadcrumbs, ...rest } = event
  return {
    ...rest,
    ...(request?.url ? { request: { url: withoutQuery(request.url) as string } } : {}),
    ...(breadcrumbs ? { breadcrumbs: breadcrumbs.map(scrubWebBreadcrumb) } : {}),
  }
}

/** The tracker's ingest origin for the content security policy; empty when reporting is off. */
export const sentryIngestOrigin = (dsn: string) => (URL.canParse(dsn) ? new URL(dsn).origin : '')

// Takes the DSN instead of reading app settings, so start-up builds no schema before zod is jitless.
/** Shared by the browser and server start-up; an empty DSN turns reporting off. */
export const webSentryOptions = (dsn: string): BrowserOptions => ({
  dsn,
  enabled: Boolean(dsn),
  sendDefaultPii: false,
  // Error capture only: no session replay and no performance tracing.
  tracesSampleRate: 0,
  beforeSend: scrubWebEvent,
  beforeBreadcrumb: scrubWebBreadcrumb,
})
