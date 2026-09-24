import type { Metadata } from 'next'

import { BeneficiaryFormLoader } from '@/features/beneficiaries/beneficiary-form-loader'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Edit Beneficiary Profile' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiaryEdit', props)
  const beneficiaryId = (await props.params)?.beneficiaryId ?? ''
  const requestedProjectId = (await props.searchParams)?.projectId
  const projectId = typeof requestedProjectId === 'string' ? requestedProjectId : undefined

  return <BeneficiaryFormLoader beneficiaryId={beneficiaryId} projectId={projectId} />
}
