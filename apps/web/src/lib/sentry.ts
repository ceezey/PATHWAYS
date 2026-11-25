import type { Breadcrumb, BrowserOptions, ErrorEvent } from '@sentry/nextjs'

// Queries can carry recovery codes and identifiers, so no reported URL keeps one.
const withoutQuery = (url: unknown) => (typeof url === 'string' ? url.split(/[?#]/)[0] : url)

// The SDK also keeps a request's query and fragment in these breadcrumb fields.
const queryKeys = new Set(['http.query', 'http.fragment'])
const addressKeys = new Set(['url', 'from', 'to'])

const scrubData = (data: Breadcrumb['data']) =>
  data &&
  Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !queryKeys.has(key))
      .map(([key, value]) => [key, addressKeys.has(key) ? withoutQuery(value) : value]),
  )

/** Drops console messages, and the query from a breadcrumb's addresses, before it is kept. */
export const scrubWebBreadcrumb = (crumb: Breadcrumb): Breadcrumb | null =>
  crumb.category === 'console' ? null : { ...crumb, data: scrubData(crumb.data) }

/** Keeps only the error and addresses without their query: no user, body, cookies or headers. */
export const scrubWebEvent = (event: ErrorEvent): ErrorEvent => {
  const { user: _user, request, breadcrumbs, contexts, ...rest } = event
  const nextjs = contexts?.nextjs
  return {
    ...rest,
    ...(request?.url ? { request: { url: withoutQuery(request.url) as string } } : {}),
    ...(breadcrumbs
      ? {
          breadcrumbs: breadcrumbs
            .map(scrubWebBreadcrumb)
            .filter((crumb): crumb is Breadcrumb => crumb !== null),
        }
      : {}),
    // A server request error records its path with the query in this context.
    ...(contexts
      ? {
          contexts: nextjs
            ? {
                ...contexts,
                nextjs: { ...nextjs, request_path: withoutQuery(nextjs.request_path) },
              }
            : contexts,
        }
      : {}),
  }
}

// Takes the DSN instead of reading app settings, so start-up builds no schema before zod is jitless.
/** Shared by the browser and server start-up; an empty DSN turns reporting off. */
export const webSentryOptions = (dsn: string): BrowserOptions => ({
  dsn,
  enabled: Boolean(dsn),
  sendDefaultPii: false,
  // No tracesSampleRate: the SDK records traces whenever it is set, even to 0.
  beforeSend: scrubWebEvent,
  beforeBreadcrumb: scrubWebBreadcrumb,
})
