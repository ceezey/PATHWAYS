import type { Metadata } from 'next'

import { BeneficiaryDirectoryLoader } from '@/features/beneficiaries/beneficiary-directory-loader'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Beneficiary Directory' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiaries', props)
  return <BeneficiaryDirectoryLoader />
}
