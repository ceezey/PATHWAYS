import { type NextRequest, NextResponse } from 'next/server'

import { siteHostname, splitSites } from './site-split'

/** Pages the public address serves; every other page belongs to the staff address. */
export const isPublicSitePath = (path: string) =>
  path === '/' || /^\/(?:about|organizations|public\/projects)(?:\/|$)/.test(path)

// Read directly, not through webEnv, so the staff address stays out of the shared browser bundle.
const sites = splitSites(
  process.env.NEXT_PUBLIC_PUBLIC_SITE_BASE_URL,
  process.env.NEXT_PUBLIC_STAFF_PORTAL_BASE_URL,
)

export function siteOf(request: NextRequest, split = sites) {
  return siteOfHost(request.headers.get('host'), split)
}

export function siteOfHost(rawHost: string | null, split = sites) {
  const host = siteHostname(rawHost ?? '')
  if (!split || !host) return null
  if (host === split.public.hostname) return 'public'
  return host === split.staff.hostname ? 'staff' : null
}

/** Keeps each address to its own pages; null means continue as a single-address app. */
export function routeSite(request: NextRequest, split = sites): NextResponse | null {
  const site = siteOf(request, split)
  if (!split || !site) return null
  const { pathname, search, searchParams } = request.nextUrl
  // An empty 404 makes the browser show its own error page, so nothing of PATHWAYS is rendered.
  if (site === 'public')
    return isPublicSitePath(pathname) ? null : new NextResponse(null, { status: 404 })
  // Supabase sends a failed recovery link to the site root with error_code; the home page routes it.
  if (pathname === '/')
    return searchParams.get('error_code')
      ? null
      : NextResponse.redirect(new URL('/staff/login', split.staff))
  return isPublicSitePath(pathname)
    ? NextResponse.redirect(new URL(pathname + search, split.public))
    : null
}
