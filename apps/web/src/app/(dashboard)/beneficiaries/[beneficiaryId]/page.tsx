import type { Metadata } from 'next'

import { BeneficiaryDetailLoader } from '@/features/beneficiaries/beneficiary-detail-loader'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Beneficiary Record' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiary', props)
  const beneficiaryId = (await props.params)?.beneficiaryId ?? ''
  const requestedProjectId = (await props.searchParams)?.projectId
  const projectId = typeof requestedProjectId === 'string' ? requestedProjectId : undefined

  return <BeneficiaryDetailLoader beneficiaryId={beneficiaryId} projectId={projectId} />
}
