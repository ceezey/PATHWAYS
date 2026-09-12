import { z } from 'zod'
import {
  type ApplicationContext,
  type ApplicationProfile,
  AuthAccessError,
  applicationContextSchema,
  developerAuthUserId,
  getLocalAuthEndpoint,
  parseApplicationProfile,
  requestAuthJson,
} from './auth-access'

export const contextCookieName = 'pathways-context'
const selectionSchema = applicationContextSchema
  .extend({
    authUserId: z.literal(developerAuthUserId),
  })
  .strict()

const resolutionSchema = z
  .object({
    authUserId: z.literal(developerAuthUserId),
    prototypeOnly: z.literal(true),
    workspaces: z
      .array(applicationContextSchema.extend({ displayName: z.string().min(1).max(120) }).strict())
      .max(1),
  })
  .strict()

export function parseWorkspaceResolution(value: unknown, subject: string) {
  const result = resolutionSchema.safeParse(value)
  if (!result.success || result.data.authUserId !== subject) throw new AuthAccessError(503)
  return result.data.workspaces[0] ?? null
}

/** D1: zero denies, one auto-selects, multiple/malformed fails closed. No browser
 * context is an input. /me independently revalidates the returned selectors.
 */
export async function resolveWorkspaceProfile(
  baseUrl: string,
  token: string,
  subject: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ApplicationProfile | null> {
  const workspace = parseWorkspaceResolution(
    await requestAuthJson(baseUrl, '/auth/workspaces', token, signal, undefined, fetcher),
    subject,
  )
  if (signal.aborted) throw new AuthAccessError('network')
  if (!workspace) return null
  const profile = parseApplicationProfile(
    await requestAuthJson(baseUrl, '/auth/me', token, signal, workspace, fetcher),
  )
  if (signal.aborted) throw new AuthAccessError('network')
  if (
    profile.id !== subject ||
    profile.userId !== workspace.userId ||
    profile.organizationId !== workspace.organizationId ||
    !workspacePermissions(profile).readProjects
  ) {
    throw new AuthAccessError(403)
  }
  return profile
}

export const clearWorkspaceContext = () => {
  document.cookie = `${contextCookieName}=; Path=/; SameSite=Strict; Max-Age=0`
}

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
