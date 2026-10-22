import { type NextRequest, NextResponse } from 'next/server'

/** Pages the public address serves; every other page belongs to the staff address. */
export const isPublicSitePath = (path: string) =>
  path === '/' || /^\/(?:about|organizations|public\/projects)(?:\/|$)/.test(path)

export type Sites = { public: URL; staff: URL }

// The split is on only when both addresses are set to different hosts.
export function configuredSites(publicUrl: string, staffUrl: string): Sites | null {
  if (!publicUrl || !staffUrl) return null
  const sites = { public: new URL(publicUrl), staff: new URL(staffUrl) }
  return sites.public.host === sites.staff.host ? null : sites
}

// Read directly, not through webEnv, so the staff address stays out of the shared browser bundle.
const sites = configuredSites(
  process.env.NEXT_PUBLIC_PUBLIC_SITE_BASE_URL ?? '',
  process.env.NEXT_PUBLIC_STAFF_PORTAL_BASE_URL ?? '',
)

export function siteOf(request: NextRequest, split = sites) {
  const host = request.headers.get('host')
  if (!split || !host) return null
  if (host === split.public.host) return 'public'
  return host === split.staff.host ? 'staff' : null
}

/** Keeps each address to its own pages; null means continue as a single-address app. */
export function routeSite(request: NextRequest, split = sites): NextResponse | null {
  const site = siteOf(request, split)
  if (!split || !site) return null
  const { pathname, search, searchParams } = request.nextUrl
  if (site === 'public')
    return isPublicSitePath(pathname) ? null : NextResponse.rewrite(new URL('/404', request.url))
  // Supabase sends a failed recovery link to the site root with error_code; the home page routes it.
  if (pathname === '/')
    return searchParams.has('error_code')
      ? null
      : NextResponse.redirect(new URL('/staff/login', split.staff))
  return isPublicSitePath(pathname)
    ? NextResponse.redirect(new URL(pathname + search, split.public))
    : null
}
