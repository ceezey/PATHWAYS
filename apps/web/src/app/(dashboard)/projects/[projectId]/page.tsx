import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Project Overview' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('project', props)
  const projectId = (await props.params)?.projectId ?? ''

  // Project Activities is the landing tab now that the Overview tab is gone.
  redirect(`/projects/${projectId}/activities`)
}
