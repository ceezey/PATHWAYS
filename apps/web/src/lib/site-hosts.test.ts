import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { configuredSites, routeSite, siteOf } from './site-hosts'

const split = configuredSites('https://pathways.example.org', 'https://staff.pathways.example.org')
const request = (host: string, path: string) =>
  new NextRequest(`https://${host}${path}`, { headers: { host } })
const route = (host: string, path: string) => routeSite(request(host, path), split)

describe('public and staff address split', () => {
  it('is off unless both addresses are set to different hosts', () => {
    expect(configuredSites('', 'https://staff.example.org')).toBeNull()
    expect(configuredSites('https://example.org', '')).toBeNull()
    expect(configuredSites('https://example.org', 'https://example.org/')).toBeNull()
    expect(routeSite(request('pathways.example.org', '/dashboard'), null)).toBeNull()
  })

  it.each(['/', '/about', '/organizations/plan', '/public/projects', '/public/projects/abc'])(
    'serves %s on the public address',
    (path) => expect(route('pathways.example.org', path)).toBeNull(),
  )

  it.each([
    '/login',
    '/staff/login',
    '/auth/mfa',
    '/auth/recovery/callback',
    '/dashboard',
    '/collection/import',
    '/print/receipts',
    '/publicity',
  ])('shows not found for %s on the public address', (path) => {
    const response = route('pathways.example.org', path)
    expect(response?.headers.get('x-middleware-rewrite')).toBe('https://pathways.example.org/404')
    expect(response?.headers.get('location')).toBeNull()
  })

  it('opens the staff address on the login page', () => {
    expect(route('staff.pathways.example.org', '/')?.headers.get('location')).toBe(
      'https://staff.pathways.example.org/staff/login',
    )
    expect(route('staff.pathways.example.org', '/?error_code=otp_expired')).toBeNull()
  })

  it('sends public pages on the staff address to the public address', () => {
    expect(
      route('staff.pathways.example.org', '/public/projects/abc?x=1')?.headers.get('location'),
    ).toBe('https://pathways.example.org/public/projects/abc?x=1')
  })

  it.each(['/staff/login', '/dashboard', '/auth/recovery/callback'])(
    'serves %s on the staff address',
    (path) => expect(route('staff.pathways.example.org', path)).toBeNull(),
  )

  it('leaves other hosts, such as Vercel deployment URLs, as a single address', () => {
    expect(siteOf(request('pathways-web-abc.vercel.app', '/'), split)).toBeNull()
    expect(route('pathways-web-abc.vercel.app', '/dashboard')).toBeNull()
    expect(route('pathways-web-abc.vercel.app', '/')).toBeNull()
  })
})
