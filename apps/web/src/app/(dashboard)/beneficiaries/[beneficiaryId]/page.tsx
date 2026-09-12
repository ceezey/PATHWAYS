import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { BeneficiaryDetailLoader } from '@/features/beneficiaries/beneficiary-detail-loader'

async function BeneficiaryDetailPage({
  params,
}: {
  params: Promise<{ beneficiaryId: string }>
}) {
  const { beneficiaryId } = await params

  return <BeneficiaryDetailLoader beneficiaryId={beneficiaryId} />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiary', props)
  return BeneficiaryDetailPage(props as Parameters<typeof BeneficiaryDetailPage>[0])
}
