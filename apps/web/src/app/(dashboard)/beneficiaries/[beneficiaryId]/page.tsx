import { BeneficiaryDetailLoader } from '@/features/beneficiaries/beneficiary-detail-loader'

export default async function BeneficiaryDetailPage({
  params,
}: {
  params: Promise<{ beneficiaryId: string }>
}) {
  const { beneficiaryId } = await params

  return <BeneficiaryDetailLoader beneficiaryId={beneficiaryId} />
}
