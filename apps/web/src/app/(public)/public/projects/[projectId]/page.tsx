import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PublicTrackerDetail, PublicTrackerUnavailable } from '@/features/public'
import { readPublicAnalytics, readPublicSnapshots } from '@/lib/api/public'

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
  const project = result?.[0]
  if (!project) return <PublicTrackerUnavailable />
  // A view that fails to load becomes null, so only its own card shows as unavailable.
  const settled = await Promise.allSettled(
    project.views.map((v) => readPublicAnalytics(project.id, v)),
  )
  const analytics = Object.fromEntries(
    project.views.map((view, i) => {
      const read = settled[i]
      return [view, read?.status === 'fulfilled' ? read.value : null]
    }),
  )
  return <PublicTrackerDetail project={project} analytics={analytics} />
}
