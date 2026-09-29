'use client'
import { HumanReviewWorkspace } from './human-review-workspace'
export const AlertsWorkspace = ({ initialAlertId }: { initialAlertId?: string }) => (
  <HumanReviewWorkspace kind="alert" initialId={initialAlertId} />
)
