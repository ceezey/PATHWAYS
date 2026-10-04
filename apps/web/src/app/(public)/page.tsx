import type { Metadata } from 'next'

import { PublicTrackerHome, PublicTrackerUnavailable } from '@/features/public/public-tracker-view'
import { readPublicSnapshots } from '@/lib/services/public-projects'

export const metadata: Metadata = { title: 'Public Impact Overview' }
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const projects = await readPublicSnapshots().catch(() => null)
  return projects ? <PublicTrackerHome projects={projects} /> : <PublicTrackerUnavailable />
}
