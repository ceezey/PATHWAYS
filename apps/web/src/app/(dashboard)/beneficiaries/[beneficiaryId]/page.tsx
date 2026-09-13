import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { BeneficiaryDetailLoader } from '@/features/beneficiaries/beneficiary-detail-loader'

async function BeneficiaryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ beneficiaryId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { beneficiaryId } = await params
  const query = await searchParams
  const requestedProjectId = typeof query?.projectId === 'string' ? query.projectId : undefined

  return (
    <BeneficiaryDetailLoader
      beneficiaryId={beneficiaryId}
      requestedProjectId={requestedProjectId}
    />
  )
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiary', props)
  return BeneficiaryDetailPage(props as Parameters<typeof BeneficiaryDetailPage>[0])
}
