import { z } from 'zod'

import { approvedApiBaseUrl } from '@/lib/api-base-url'
import type { PathwaysRole } from '@/types/pathways-role'

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
  authUserId: uuid,
  aal: z.enum(['aal1', 'aal2']),
  enrollmentAllowed: z.literal(true),
  applicationAccessEnabled: z.boolean(),
})

const profileSchema = z.object({
  user: z.object({
    id: uuid,
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
          ? 'Access was denied (403). Ask an administrator to review your workspace access, or sign out and try again.'
          : status === 503
            ? 'Application access verification is temporarily unavailable (503). Wait a moment and retry; do not change your password or provision another account.'
            : status === 'timeout'
              ? 'The API check timed out. Try again shortly.'
              : status === 'network'
                ? 'The API could not be reached. Try again shortly.'
                : 'The API could not complete the access check.'
    super(`${detail} No protected access was granted.`)
  }
}

export const getProfileRole = (profile: ApplicationProfile): PathwaysRole =>
  canonicalRoles[profile.roles[0]]

export const parseMfaStatus = (value: unknown): MfaStatus => mfaStatusSchema.parse(value)
export const parseApplicationProfile = (value: unknown): ApplicationProfile =>
  profileSchema.parse(value).user

type AuthPath = '/auth/mfa/status' | '/auth/me' | '/auth/workspaces'

export const getLocalAuthEndpoint = (baseUrl: string, path: AuthPath, trustedBaseUrl?: string) => {
  const url = approvedApiBaseUrl(baseUrl, trustedBaseUrl)
  return `${url.toString().replace(/\/$/, '')}${path}`
}

export async function requestAuthJson(
  baseUrl: string,
  path: AuthPath,
  token: string,
  signal?: AbortSignal,
  context?: ApplicationContext,
  fetcher: typeof fetch = fetch,
  trustedBaseUrl?: string,
): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (path === '/auth/workspaces' && context) throw new AuthAccessError(400)
  if (context) {
    const selected = applicationContextSchema.parse(context)
    // Selectors only. The API must verify their linkage to the authenticated subject.
    headers['X-Pathways-User-Id'] = selected.userId
    headers['X-Pathways-Organization-Id'] = selected.organizationId
  }
  const endpoint = getLocalAuthEndpoint(baseUrl, path, trustedBaseUrl)
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
