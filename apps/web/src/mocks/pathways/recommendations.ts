import type { RecommendationRecord } from '@/types/pathways'

export const mockRecommendations: RecommendationRecord[] = [
  {
    id: 'rec-fm-bootcamp',
    alertId: 'alert-fm-bootcamp',
    text: 'Review bootcamp progress evidence and decide whether the next cohort support package should proceed.',
    reviewStatus: 'New',
  },
  {
    id: 'rec-yr-site-delay',
    alertId: 'alert-yr-site-delay',
    text: 'Review site readiness blockers and confirm whether additional field support is needed.',
    reviewStatus: 'New',
  },
  {
    id: 'rec-ss-budget',
    alertId: 'alert-ss-budget',
    text: 'Compare spending against approved activity plans before authorizing additional releases.',
    reviewStatus: 'Reviewed',
  },
]
