import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { webEnv } from '@/lib/env'
import { type PublicProjectResponse, publicProjectResponse } from '@pathways/shared'
import { z } from 'zod'

// Reads the allowlisted public snapshots; throws PUBLIC_NOT_FOUND or PUBLIC_UNAVAILABLE.
export async function readPublicSnapshots(projectId?: string): Promise<PublicProjectResponse[]> {
  if (projectId && !z.guid().safeParse(projectId).success) throw new Error('PUBLIC_NOT_FOUND')
  const base = approvedApiBaseUrl(webEnv.NEXT_PUBLIC_API_BASE_URL, webEnv.NEXT_PUBLIC_API_BASE_URL)
  const url = `${base.toString().replace(/\/$/, '')}/public/projects${projectId ? `/${projectId}` : '?limit=100'}`
  // Anonymous reads never carry a staff bearer token, workspace context, cookies, or redirects.
  const response = await fetch(url, {
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
  const value: unknown = JSON.parse(text)
  return projectId
    ? [publicProjectResponse.parse(value)]
    : z.array(publicProjectResponse).max(100).parse(value)
}
