import { type NextRequest, NextResponse } from 'next/server'

import { updateSession } from './lib/middleware'
import { routeSite, siteOf } from './lib/site-hosts'

// Staff pages that need the session check, the same set the matcher listed before the address split.
const sessionPath =
  /^\/(?:workspace|auth\/mfa|unauthorized)$|^\/(?:dashboard|projects|beneficiaries|collection|analytics|alerts|recommendations|imports|participants|reports|settings)(?:\/|$)/

export async function middleware(request: NextRequest) {
  const routed = routeSite(request)
  if (routed) return routed
  const response = sessionPath.test(request.nextUrl.pathname)
    ? await updateSession(request)
    : NextResponse.next()
  if (siteOf(request) === 'staff') response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export const config = {
  // Every page, so each address keeps to its own; build output and static files are skipped.
  matcher: ['/((?!_next/|_vercel/|brand/|maplibre/|favicon\\.ico).*)'],
}
