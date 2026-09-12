import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { developerAuthUserId, developerSupabaseUrl } from '../../features/auth/auth-access'
import { contextCookieName, decodeWorkspaceContext } from '../../features/auth/workspace-access'
import { webEnv } from '../env'
import { createClient } from '../server'
import { type NavigationStage, recordNavigationDenial } from './navigation-diagnostic'
import {
  RouteCheckError,
  type RouteKey,
  type RouteSelection,
  parseRouteSelection,
  requestRouteCheck,
} from './route-access'

export type ProtectedPageProps = {
  params?: Promise<Record<string, string>>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}
export async function requireServerPage(route: RouteKey, props: ProtectedPageProps) {
  const { _rsc: _transport, ...query } = (await props.searchParams) ?? {}
  if (
    Object.keys(query).some(
      (key) =>
        !((route === 'reportPreview' && key === 'kind') || (route === 'imports' && key === 'mode')),
    )
  )
    redirect('/unauthorized')
  const selection = parseRouteSelection({ route, ...(await props.params), ...query })
  if (!selection) redirect('/unauthorized')
  return requireServerRoute(selection)
}

// No React/global cache: each protected page render revalidates through the API.
export async function requireServerRoute(selection: RouteSelection) {
  let target = '/auth/mfa'
  let stage: NavigationStage = 'CONFIGURATION'
  try {
    const supabase = await createClient()
    stage = 'CLAIMS'
    const claims = await supabase.auth.getClaims()
    if (claims.error || !claims.data?.claims) throw new RouteCheckError(401)
    const identity = claims.data.claims
    stage = 'IDENTITY'
    if (
      identity.sub !== developerAuthUserId ||
      identity.iss !== `${developerSupabaseUrl}/auth/v1` ||
      identity.aud !== 'authenticated' ||
      identity.is_anonymous !== false
    )
      throw new RouteCheckError(401)
    stage = 'ASSURANCE'
    if (identity.aal !== 'aal2') throw new RouteCheckError(403)
    stage = 'CONTEXT'
    const store = await cookies()
    const context = decodeWorkspaceContext(store.get(contextCookieName)?.value, identity.sub)
    if (!context) throw new RouteCheckError(403)
    // Supplies a bearer only. Nest verifies signature, online identity, live
    // session, current membership and object scope independently on every call.
    stage = 'SESSION'
    const session = await supabase.auth.getSession()
    if (session.error || !session.data.session) throw new RouteCheckError(401)
    stage = 'ROUTE_API'
    return await requestRouteCheck(
      webEnv.NEXT_PUBLIC_API_BASE_URL,
      session.data.session.access_token,
      context,
      selection,
    )
  } catch (error) {
    recordNavigationDenial('SERVER_PAGE', stage, error)
    if (error instanceof RouteCheckError && error.status === 401) target = '/staff/login'
    else if (
      error instanceof RouteCheckError &&
      [403, 404].includes(error.status) &&
      selection.route !== 'unauthorized'
    )
      target = '/unauthorized'
  }
  redirect(target)
}
