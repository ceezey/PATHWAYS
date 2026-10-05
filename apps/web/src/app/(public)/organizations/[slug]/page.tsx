import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { publicOrganizations } from '@/constants/navigation'
import { PublicOrganizationPage } from '@/features/public/public-organizations'
import { readPublicSnapshots } from '@/lib/services/public-projects'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const findOrganization = (slug: string) => publicOrganizations.find((item) => item.slug === slug)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: findOrganization((await params).slug)?.name ?? 'Organization' }
}

export default async function OrganizationProjectsPage({ params }: Props) {
  const organization = findOrganization((await params).slug)
  if (!organization) notFound()
  // Public snapshots carry no organization field; the single public organization owns every published project.
  const projects = await readPublicSnapshots().catch(() => null)
  return <PublicOrganizationPage organization={organization} projects={projects} />
}
