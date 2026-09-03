import type { Metadata } from 'next'

import { BeneficiaryDetailLoader } from '@/features/beneficiaries/beneficiary-detail-loader'

export const metadata: Metadata = { title: 'Beneficiary Record' }

export default async function BeneficiaryDetailPage({
  params,
}: {
  params: Promise<{ beneficiaryId: string }>
}) {
  const { beneficiaryId } = await params

  return <BeneficiaryDetailLoader beneficiaryId={beneficiaryId} />
}
