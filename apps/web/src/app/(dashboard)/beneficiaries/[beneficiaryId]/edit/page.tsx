import type { Metadata } from 'next'

import { BeneficiaryFormLoader } from '@/features/beneficiaries/beneficiary-form-loader'

export const metadata: Metadata = { title: 'Edit Beneficiary Profile' }

export default async function EditBeneficiaryPage({
  params,
}: {
  params: Promise<{ beneficiaryId: string }>
}) {
  const { beneficiaryId } = await params

  return <BeneficiaryFormLoader beneficiaryId={beneficiaryId} />
}
