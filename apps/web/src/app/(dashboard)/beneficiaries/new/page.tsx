import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { BeneficiaryFormLoader } from '@/features/beneficiaries/beneficiary-form-loader'

function NewBeneficiaryPage() {
  return <BeneficiaryFormLoader />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiaryCreate', props)
  return NewBeneficiaryPage()
}
