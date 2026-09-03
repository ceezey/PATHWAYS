import type { Metadata } from 'next'

import { BeneficiaryDirectoryLoader } from '@/features/beneficiaries/beneficiary-directory-loader'

export const metadata: Metadata = { title: 'Beneficiary Directory' }

export default function BeneficiariesPage() {
  return <BeneficiaryDirectoryLoader />
}
