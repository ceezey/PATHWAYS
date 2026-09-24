import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

import { contextCookieName, decodeWorkspaceContext } from '@/features/auth/workspace-access'
import { webEnv, webSupabasePublishableKey } from '@/lib/env'
import { ACCESS_UNAVAILABLE_PATH, providerFailureStatus } from '@/lib/rbac/access-recovery'
import { type NavigationStage, recordNavigationDenial } from '@/lib/rbac/navigation-diagnostic'
import {
  RouteCheckError,
  authorizationPathForUiPath,
  isPublicPath,
  matchRoute,
} from '@/lib/rbac/route-access'

/** Optimistic navigation gate only. Every protected data page and API keeps
 * its existing current-session/database/object authorization before data access.
 * No /auth/me or route-check RPC is repeated here for navigation/prefetches.
 */
export async function updateSession(request: NextRequest) {
  if (
    isPublicPath(request.nextUrl.pathname) ||
    request.nextUrl.pathname === ACCESS_UNAVAILABLE_PATH
  )
    return NextResponse.next()
  const configuredUrl = (webEnv.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  let stage: NavigationStage = 'CONFIGURATION'
  const denied = (error?: unknown) => recordNavigationDenial('MIDDLEWARE', stage, error)
  const redirect = (path: string, source?: NextResponse, clearContext = false) => {
    const url = new URL(request.url)
    if (request.headers.get('host') === '127.0.0.1:3000') url.host = '127.0.0.1:3000'
    url.pathname = path
    url.search = ''
    const response = NextResponse.redirect(url)
    for (const cookie of source?.cookies.getAll() ?? []) response.cookies.set(cookie)
    if (clearContext)
      response.cookies.set(contextCookieName, '', { path: '/', maxAge: 0, sameSite: 'strict' })
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
  if (!configuredUrl || !webSupabasePublishableKey) {
    denied()
    return redirect(ACCESS_UNAVAILABLE_PATH)
  }
  let response = NextResponse.next({ request })
  try {
    const supabase = createServerClient(configuredUrl, webSupabasePublishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, cacheHeaders) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options)
          for (const [name, value] of Object.entries(cacheHeaders ?? {}))
            response.headers.set(name, value)
        },
      },
    })
    // Keep immediately after createServerClient so refreshed cookies propagate.
    stage = 'CLAIMS'
    const { data, error } = await supabase.auth.getClaims()
    if (error) throw new RouteCheckError(providerFailureStatus(error), 'http')
    if (!data?.claims) {
      denied()
      return redirect('/staff/login', response, true)
    }
    const claims = data.claims
    stage = 'IDENTITY'
    if (
      typeof claims.sub !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.sub) ||
      claims.iss !== `${configuredUrl}/auth/v1` ||
      claims.aud !== 'authenticated' ||
      claims.is_anonymous !== false
    ) {
      denied()
      return redirect('/staff/login', response, true)
    }
    if (request.nextUrl.pathname !== '/auth/mfa') {
      stage = 'ASSURANCE'
      if (claims.aal !== 'aal2') {
        denied()
        return redirect('/auth/mfa', response, true)
      }
      stage = 'CONTEXT'
      const context = decodeWorkspaceContext(
        request.cookies.get(contextCookieName)?.value,
        claims.sub,
      )
      if (!context) {
        denied()
        // Bootstrap missing selectors; aal2 users are not asked for a new code.
        return redirect('/auth/mfa', response, true)
      }
      if (request.nextUrl.pathname !== '/workspace') {
        stage = 'ROUTE_POLICY'
        const query = new URLSearchParams(request.nextUrl.search)
        query.delete('_rsc')
        const path = request.nextUrl.pathname + (query.size ? `?${query}` : '')
        const authorizationPath = authorizationPathForUiPath(path)
        if (!authorizationPath || !matchRoute(authorizationPath)) {
          denied()
          return redirect('/unauthorized', response)
        }
      }
    }
  } catch (error) {
    denied(error)
    if (error instanceof RouteCheckError && error.status === 401)
      return redirect('/staff/login', response, true)
    return redirect(ACCESS_UNAVAILABLE_PATH, response)
  }
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
