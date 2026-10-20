import type { StatusTone } from '@/lib/format/tone'
import type { EvaluationDetailResponse } from '@pathways/shared'

export type EvaluationDetail = EvaluationDetailResponse
export type SavedScore = EvaluationDetail['scores'][number]

export const statusTone = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  REVIEWED: 'info',
  SIGNED_OFF: 'success',
  ARCHIVED: 'neutral',
} as const satisfies Record<EvaluationDetail['status'], StatusTone>
export const openStatuses = new Set(['DRAFT', 'SUBMITTED', 'REVIEWED'])
// Criteria appear in OECD-DAC order; anything else (older rounds) follows by name.
const criterionOrder = [
  'RELEVANCE',
  'COHERENCE',
  'EFFECTIVENESS',
  'EFFICIENCY',
  'IMPACT',
  'SUSTAINABILITY',
]
export const orderOf = (score: SavedScore) => {
  const index = criterionOrder.indexOf(score.criterion.code)
  return index < 0 ? criterionOrder.length : index
}
export const points = (value: string | number) => Number(Number(value).toFixed(1))
export const today = () => new Date().toISOString().slice(0, 10)
export const named = (value: { id: string; name: string } | null) => value?.name ?? 'Not yet'
