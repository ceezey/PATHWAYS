import { z } from 'zod'

import type { PathwaysRole } from '@/types/pathways-role'

// This preparation is deliberately restricted to the one reviewed development identity.
// It does not provision a PATHWAYS profile or authorize general onboarding.
export const developerAuthUserId = '56ad4c1a-113f-401b-84e8-1d2135f174c1'
export const developerSupabaseUrl = 'https://pdqwsknbzkdtiwjjibqt.supabase.co'

const uuid = z.string().uuid()
const canonicalRoles = {
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  PROGRAM_MANAGER: 'Program Manager',
  GRANT_MANAGER: 'Grant Manager',
  PROJECT_MANAGER: 'Project Manager',
  MONITORING_AND_EVALUATION_OFFICER: 'Monitoring and Evaluation Officer',
  PROJECT_OFFICER: 'Project Officer',
} as const satisfies Record<string, PathwaysRole>

const mfaStatusSchema = z.object({
  authUserId: z.literal(developerAuthUserId),
  aal: z.enum(['aal1', 'aal2']),
  enrollmentAllowed: z.literal(true),
  applicationAccessEnabled: z.boolean(),
})

const profileSchema = z.object({
  user: z.object({
    id: z.literal(developerAuthUserId),
    userId: uuid,
    organizationId: uuid,
    fullName: z.string().min(1),
    roles: z.array(z.enum(Object.keys(canonicalRoles) as [keyof typeof canonicalRoles])).length(1),
    permissions: z.array(z.string().min(1)),
    assignedProjectIds: z.array(uuid),
    aal: z.literal('aal2'),
  }),
})

export type MfaStatus = z.infer<typeof mfaStatusSchema>
export type ApplicationProfile = z.infer<typeof profileSchema>['user']
export interface ApplicationContext {
  userId: string
  organizationId: string
}

export const applicationContextSchema = z.object({ userId: uuid, organizationId: uuid })

// Only fixed, non-secret diagnostics reach the UI. Never display provider bodies.
export class AuthAccessError extends Error {
  constructor(readonly status: number | 'network' | 'timeout') {
    const detail =
      status === 401
        ? 'Your session was not accepted (401). Sign in again and complete TOTP.'
        : status === 403
          ? 'Access was denied (403). Check the application user UUID and organization UUID; do not use your Auth UUID or PLAN_PH.'
          : status === 503
            ? 'Application access verification is temporarily unavailable (503). Wait a moment and retry; do not change your password or provision another account.'
            : status === 'timeout'
              ? 'The local API check timed out. Check that the developer API is running, then retry.'
              : status === 'network'
                ? 'The local API could not be reached. Check that the developer API is running.'
                : 'The local API could not complete the access check.'
    super(`${detail} No protected access was granted.`)
  }
}

export const getProfileRole = (profile: ApplicationProfile): PathwaysRole =>
  canonicalRoles[profile.roles[0]]

export const parseMfaStatus = (value: unknown): MfaStatus => mfaStatusSchema.parse(value)
export const parseApplicationProfile = (value: unknown): ApplicationProfile =>
  profileSchema.parse(value).user

export const getLocalAuthEndpoint = (baseUrl: string, path: '/auth/mfa/status' | '/auth/me') => {
  const url = new URL(baseUrl)
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('This developer MFA preparation requires a local PATHWAYS API.')
  }
  // The API deliberately listens on IPv4 loopback only. Normalize every
  // accepted loopback spelling so `localhost` cannot resolve to IPv6 first and
  // make a running local API look unavailable.
  url.hostname = '127.0.0.1'
  return `${url.toString().replace(/\/$/, '')}${path}`
}

export async function requestAuthJson(
  baseUrl: string,
  path: '/auth/mfa/status' | '/auth/me',
  token: string,
  signal?: AbortSignal,
  context?: ApplicationContext,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (context) {
    const selected = applicationContextSchema.parse(context)
    // Selectors only. The API must verify their linkage to the authenticated subject.
    headers['X-Pathways-User-Id'] = selected.userId
    headers['X-Pathways-Organization-Id'] = selected.organizationId
  }
  const endpoint = getLocalAuthEndpoint(baseUrl, path)
  // Next 15's Edge Runtime has no AbortSignal.any. Compose cancellation without
  // that API so the same helper works in middleware and in the browser.
  const controller = new AbortController()
  const cancel = () => controller.abort()
  let timedOut = false
  const deadline = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 20_000)
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  try {
    const response = await fetcher(endpoint, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    if (!response.ok) throw new AuthAccessError(response.status)
    return await response.json()
  } catch (error) {
    if (error instanceof AuthAccessError) throw error
    throw new AuthAccessError(timedOut ? 'timeout' : 'network')
  } finally {
    clearTimeout(deadline)
    signal?.removeEventListener('abort', cancel)
  }
}

export const hasCurrentProfile = (
  profileToken: string | undefined,
  sessionToken: string | undefined,
) => Boolean(profileToken && sessionToken && profileToken === sessionToken)
