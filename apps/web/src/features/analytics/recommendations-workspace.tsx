'use client'
import { HumanReviewWorkspace } from './human-review-workspace'
export const RecommendationsWorkspace = ({
  initialRecommendationId,
}: { initialRecommendationId?: string }) => (
  <HumanReviewWorkspace kind="recommendation" initialId={initialRecommendationId} />
)
