import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  PublicTrackerDetail,
  PublicTrackerUnavailable,
} from '@/features/public/public-tracker-view'
import { readPublicSnapshots } from '@/lib/services/public-projects'

export const metadata: Metadata = { title: 'Public Project Story' }
export const dynamic = 'force-dynamic'

export default async function PublicProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const result = await readPublicSnapshots(projectId).catch((error: unknown) =>
    error instanceof Error && error.message === 'PUBLIC_NOT_FOUND' ? 'not_found' : null,
  )
  if (result === 'not_found') notFound()
  return result?.[0] ? <PublicTrackerDetail project={result[0]} /> : <PublicTrackerUnavailable />
}
