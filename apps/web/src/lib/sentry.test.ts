import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'

import { scrubWebBreadcrumb, scrubWebEvent, webSentryOptions } from './sentry'

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
    expect(crumb?.data).toEqual({ url: '/api/public/projects' })
  })

  it('drops the query a server request error and a server request breadcrumb record', () => {
    const event = scrubWebEvent({
      type: undefined,
      contexts: {
        nextjs: {
          request_path: '/auth/recovery/callback?code=secret-code',
          router_kind: 'App Router',
        },
      },
      breadcrumbs: [
        {
          category: 'http',
          data: {
            url: 'https://api.example.org/x',
            'http.query': '?token=t',
            'http.fragment': '#f',
          },
        },
      ],
    } as unknown as ErrorEvent)
    expect(event.contexts?.nextjs).toEqual({
      request_path: '/auth/recovery/callback',
      router_kind: 'App Router',
    })
    expect(event.breadcrumbs?.[0]?.data).toEqual({ url: 'https://api.example.org/x' })
    expect(JSON.stringify(event)).not.toMatch(/secret-code|token=|#f/)
  })

  it('keeps no console message, which can hold anything', () => {
    expect(
      scrubWebBreadcrumb({ category: 'console', message: 'ana@example.org' } as Breadcrumb),
    ).toBeNull()
    const event = scrubWebEvent({
      type: undefined,
      breadcrumbs: [{ category: 'console', message: 'x' }, { category: 'ui.click' }],
    } as ErrorEvent)
    expect(event.breadcrumbs?.map((crumb) => crumb.category)).toEqual(['ui.click'])
  })

  it('reports errors only: no tracing, and nothing at all without a DSN', () => {
    const on = webSentryOptions('https://publickey@o123.ingest.example.io/456')
    // The SDK starts tracing when either setting is present at all, even 0.
    expect('tracesSampleRate' in on).toBe(false)
    expect('tracesSampler' in on).toBe(false)
    expect(on).toMatchObject({ enabled: true, sendDefaultPii: false })
    expect(webSentryOptions('')).toMatchObject({ enabled: false })
  })
})
