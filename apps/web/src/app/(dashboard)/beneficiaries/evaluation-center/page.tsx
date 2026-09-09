import { EvaluationCenterLookup } from '@/features/beneficiaries/evaluation-center-lookup'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Evaluation Center Lookup' }
export default function EvaluationCenterPage() {
  return <EvaluationCenterLookup />
}
