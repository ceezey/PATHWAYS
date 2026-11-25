import { type NextRequest, NextResponse } from 'next/server'

import { webEnv } from './lib/env'
import { resolveMapStyleUrl } from './lib/map-style'
import { updateSession } from './lib/middleware'
import { type CspOrigins, buildCsp, securityHeaders } from './lib/security/csp'
import { routeSite, siteOf } from './lib/site-hosts'

// Staff pages that need the session check, the same set the matcher listed before the address split.
const sessionPath =
  /^\/(?:workspace|auth\/mfa|unauthorized)$|^\/(?:dashboard|projects|beneficiaries|collection|analytics|alerts|recommendations|imports|participants|reports|settings)(?:\/|$)/

// A same-site path such as /api has no origin of its own; 'self' already covers it.
const originOf = (address: string) => (URL.canParse(address) ? new URL(address).origin : '')

const cspOrigins: CspOrigins = {
  api: originOf(webEnv.NEXT_PUBLIC_API_BASE_URL),
  supabase: originOf(webEnv.NEXT_PUBLIC_SUPABASE_URL),
  tiles: [originOf(resolveMapStyleUrl())],
  extraConnect: [],
  extraFrame: [],
  // React's development build needs eval; a production build never gets it.
  extraScript: process.env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : [],
}
const cspHeader =
  webEnv.CSP_MODE === 'report-only'
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy'

export async function middleware(request: NextRequest) {
  const policy = buildCsp(btoa(crypto.randomUUID()), cspOrigins)
  // Next reads the nonce for its own scripts from this request header.
  request.headers.set('Content-Security-Policy', policy)
  const response =
    routeSite(request) ??
    (sessionPath.test(request.nextUrl.pathname)
      ? await updateSession(request)
      : NextResponse.next({ request }))
  if (siteOf(request) === 'staff') response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  response.headers.set(cspHeader, policy)
  for (const { key, value } of securityHeaders) response.headers.set(key, value)
  return response
}

export const config = {
  // Every page, so each address keeps to its own; build output and static files are skipped.
  matcher: ['/((?!_next/|_vercel/|brand/|maplibre/|favicon\\.ico).*)'],
}
