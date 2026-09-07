import { z } from 'zod'
import {
  type ApplicationContext,
  type ApplicationProfile,
  applicationContextSchema,
  developerAuthUserId,
  getLocalAuthEndpoint,
} from './auth-access'

export const contextCookieName = 'pathways-context'
const selectionSchema = applicationContextSchema.extend({
  authUserId: z.literal(developerAuthUserId),
})

/** Non-secret selectors only. A forged cookie confers no authority: /auth/me
 * verifies the UUID relationship, lifecycle, role and permissions afresh.
 */
export function decodeWorkspaceContext(
  value: string | undefined,
  subject: string,
): ApplicationContext | undefined {
  try {
    const selected = selectionSchema.parse(JSON.parse(decodeURIComponent(value ?? '')))
    if (selected.authUserId !== subject) return undefined
    return { userId: selected.userId, organizationId: selected.organizationId }
  } catch {
    return undefined
  }
}

export function encodeWorkspaceContext(profile: ApplicationProfile) {
  return encodeURIComponent(
    JSON.stringify({
      authUserId: profile.id,
      userId: profile.userId,
      organizationId: profile.organizationId,
    }),
  )
}

export function workspacePermissions(profile: ApplicationProfile | null) {
  // The server's current permission list controls this live UI. The prototype
  // role-only access matrix does not supply missing permissions.
  return { readProjects: profile?.permissions.includes('projects.read') === true }
}

const projectsSchema = z
  .array(
    z.object({ id: z.string().uuid(), code: z.string(), title: z.string(), status: z.string() }),
  )
  .max(100)
export type AuthorizedProject = z.infer<typeof projectsSchema>[number]

export async function requestAuthorizedProjects(
  baseUrl: string,
  token: string,
  profile: ApplicationProfile,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  if (!workspacePermissions(profile).readProjects) throw new Error('Project access is unavailable.')
  const endpoint = getLocalAuthEndpoint(baseUrl, '/auth/me').replace(
    /\/auth\/me$/,
    '/access/projects',
  )
  const response = await fetcher(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Pathways-Organization-Id': profile.organizationId,
      'X-Pathways-User-Id': profile.userId,
    },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal,
  })
  if (!response.ok) throw new Error('Project access could not be verified.')
  return projectsSchema.parse(await response.json())
}
