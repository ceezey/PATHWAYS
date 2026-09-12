import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { BeneficiaryDirectoryLoader } from '@/features/beneficiaries/beneficiary-directory-loader'

function BeneficiariesPage() {
  return <BeneficiaryDirectoryLoader />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiaries', props)
  return BeneficiariesPage()
}
