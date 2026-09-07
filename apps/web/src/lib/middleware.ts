import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

import {
  AuthAccessError,
  developerAuthUserId,
  developerSupabaseUrl,
  parseApplicationProfile,
  requestAuthJson,
} from '@/features/auth/auth-access'
import {
  contextCookieName,
  decodeWorkspaceContext,
  workspacePermissions,
} from '@/features/auth/workspace-access'
import { webEnv, webSupabasePublishableKey } from '@/lib/env'

export async function updateSession(request: NextRequest) {
  const redirect = (path: string, source?: NextResponse) => {
    // NextRequest can normalize 127.0.0.1 to localhost. Preserve only the
    // explicitly approved incoming loopback Host; never trust an arbitrary host.
    const url = new URL(request.url)
    if (request.headers.get('host') === '127.0.0.1:3000') url.host = '127.0.0.1:3000'
    url.pathname = path
    url.search = ''
    const response = NextResponse.redirect(url)
    for (const cookie of source?.cookies.getAll() ?? []) response.cookies.set(cookie)
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
  if (webEnv.NEXT_PUBLIC_SUPABASE_URL !== developerSupabaseUrl || !webSupabasePublishableKey) {
    return redirect('/staff/login')
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(webEnv.NEXT_PUBLIC_SUPABASE_URL, webSupabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }

        supabaseResponse = NextResponse.next({
          request,
        })

        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options)
        }
      },
    },
  })

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (error || !data?.claims) return redirect('/staff/login', supabaseResponse)
    const claims = data.claims
    if (
      claims.iss !== `${developerSupabaseUrl}/auth/v1` ||
      claims.aud !== 'authenticated' ||
      claims.is_anonymous !== false
    ) {
      return redirect('/staff/login', supabaseResponse)
    }
    if (request.nextUrl.pathname === '/workspace') {
      if (claims.sub !== developerAuthUserId || claims.aal !== 'aal2')
        return redirect('/auth/mfa', supabaseResponse)
      const context = decodeWorkspaceContext(
        request.cookies.get(contextCookieName)?.value,
        claims.sub,
      )
      if (!context) return redirect('/auth/mfa', supabaseResponse)
      // getSession supplies a bearer for the API; it is never itself proof of
      // authorization. NestJS verifies signature/current identity/MFA + database.
      const session = await supabase.auth.getSession()
      if (session.error || !session.data.session) return redirect('/staff/login', supabaseResponse)
      const api = new URL(webEnv.NEXT_PUBLIC_API_BASE_URL)
      if (api.hostname === 'localhost') api.hostname = '127.0.0.1'
      const profile = parseApplicationProfile(
        await requestAuthJson(
          api.toString(),
          '/auth/me',
          session.data.session.access_token,
          AbortSignal.timeout(15_000),
          context,
        ),
      )
      if (
        profile.id !== claims.sub ||
        profile.userId !== context.userId ||
        profile.organizationId !== context.organizationId ||
        !workspacePermissions(profile).readProjects
      ) {
        return redirect('/auth/mfa', supabaseResponse)
      }
    } else if (request.nextUrl.pathname !== '/auth/mfa') {
      // Unimplemented prototype modules remain closed before any RSC render.
      return redirect('/auth/mfa', supabaseResponse)
    }
  } catch (error) {
    if (error instanceof AuthAccessError && error.status !== 401) {
      // An API denial/outage is not a lost Auth session. Keep the valid session
      // and return to the MFA/profile check for a safe, visible retry.
      return redirect('/auth/mfa', supabaseResponse)
    }
    return redirect('/staff/login', supabaseResponse)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  supabaseResponse.headers.set('Cache-Control', 'private, no-store')
  supabaseResponse.headers.set('Referrer-Policy', 'no-referrer')
  return supabaseResponse
}
