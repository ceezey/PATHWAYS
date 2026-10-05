import type { Metadata } from 'next'

import { PublicOrganizationsPage } from '@/features/public/public-organizations'

export const metadata: Metadata = { title: 'Organizations' }

export default function OrganizationsPage() {
  return <PublicOrganizationsPage />
}
