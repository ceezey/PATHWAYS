import type { Metadata } from 'next'

import { PublicTrackerList, PublicTrackerUnavailable } from '@/features/public/public-tracker-view'
import { readPublicSnapshots } from '@/lib/services/public-projects'

export const metadata: Metadata = { title: 'Public Project Directory' }
export const dynamic = 'force-dynamic'

export default async function PublicProjectsPage() {
  const projects = await readPublicSnapshots().catch(() => null)
  return projects ? <PublicTrackerList projects={projects} /> : <PublicTrackerUnavailable />
}
