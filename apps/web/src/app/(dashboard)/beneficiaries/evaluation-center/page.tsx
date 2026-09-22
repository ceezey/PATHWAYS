import { EvaluationCenterLookup } from '@/features/beneficiaries/evaluation-center-lookup'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Evaluation Center Lookup' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('beneficiaries', props)
  return <EvaluationCenterLookup />
}
