import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'

import { scrubWebBreadcrumb, scrubWebEvent, sentryIngestOrigin } from './sentry'

describe('web error report filter', () => {
  it('sends no query string, user, body, cookies or headers', () => {
    const event = scrubWebEvent({
      type: undefined,
      user: { email: 'ana@example.org', ip_address: '10.0.0.1' },
      request: {
        url: 'https://staff.example.org/auth/recovery/callback?code=secret-code#frag',
        query_string: 'code=secret-code',
        data: '{"password":"x"}',
        cookies: { 'sb-access-token': 'x' },
        headers: { authorization: 'Bearer x' },
      },
      breadcrumbs: [
        {
          category: 'navigation',
          data: { from: '/staff/login?next=/x', to: '/dashboard?project=p1' },
        },
        {
          category: 'fetch',
          data: { url: 'https://api.example.org/api/x?token=t', method: 'GET' },
        },
      ],
    } as ErrorEvent)
    expect(event.user).toBeUndefined()
    expect(event.request).toEqual({ url: 'https://staff.example.org/auth/recovery/callback' })
    expect(event.breadcrumbs?.map((crumb) => crumb.data)).toEqual([
      { from: '/staff/login', to: '/dashboard' },
      { url: 'https://api.example.org/api/x', method: 'GET' },
    ])
    expect(JSON.stringify(event)).not.toMatch(/secret-code|ana@example|password|Bearer|token=/)
  })

  it('drops the query from a breadcrumb recorded before an event', () => {
    const crumb = scrubWebBreadcrumb({
      category: 'xhr',
      data: { url: '/api/public/projects?limit=100' },
    } as Breadcrumb)
    expect(crumb.data).toEqual({ url: '/api/public/projects' })
  })

  it('takes the policy origin from the DSN, or nothing when there is none', () => {
    expect(sentryIngestOrigin('https://publickey@o123.ingest.example.io/456')).toBe(
      'https://o123.ingest.example.io',
    )
    expect(sentryIngestOrigin('')).toBe('')
    expect(sentryIngestOrigin('not a url')).toBe('')
  })
})
