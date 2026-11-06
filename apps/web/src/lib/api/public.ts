import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { webEnv } from '@/lib/env'
import {
  type PublicAnalyticsResponse,
  type PublicProjectResponse,
  type PublicView,
  publicAnalyticsResponse,
  publicProjectResponse,
} from '@pathways/shared'
import { z } from 'zod'

// One anonymous read of the public API; throws PUBLIC_NOT_FOUND or PUBLIC_UNAVAILABLE.
async function readPublic(path: string): Promise<unknown> {
  const base = approvedApiBaseUrl(webEnv.NEXT_PUBLIC_API_BASE_URL, webEnv.NEXT_PUBLIC_API_BASE_URL)
  // Anonymous reads never carry a staff bearer token, workspace context, cookies, or redirects.
  const response = await fetch(`${base.toString().replace(/\/$/, '')}/public/projects${path}`, {
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(10000),
  })
  if (response.status === 404) throw new Error('PUBLIC_NOT_FOUND')
  if (!response.ok) throw new Error('PUBLIC_UNAVAILABLE')
  const text = await response.text()
  if (text.length > 1_000_000) throw new Error('PUBLIC_UNAVAILABLE')
  return JSON.parse(text)
}

// Reads the allowlisted public snapshots; throws PUBLIC_NOT_FOUND or PUBLIC_UNAVAILABLE.
export async function readPublicSnapshots(projectId?: string): Promise<PublicProjectResponse[]> {
  if (projectId && !z.guid().safeParse(projectId).success) throw new Error('PUBLIC_NOT_FOUND')
  const value = await readPublic(projectId ? `/${projectId}` : '?limit=100')
  return projectId
    ? [publicProjectResponse.parse(value)]
    : z.array(publicProjectResponse).max(100).parse(value)
}

// Reads one live analytics view of a published project; throws PUBLIC_NOT_FOUND or PUBLIC_UNAVAILABLE.
export async function readPublicAnalytics(
  projectId: string,
  view: PublicView,
): Promise<PublicAnalyticsResponse> {
  if (!z.guid().safeParse(projectId).success) throw new Error('PUBLIC_NOT_FOUND')
  const body = publicAnalyticsResponse.parse(await readPublic(`/${projectId}/analytics/${view}`))
  if (body.view !== view) throw new Error('PUBLIC_UNAVAILABLE')
  return body
}
