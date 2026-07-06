import type { RecommendationRecord } from '@/types/pathways'

export const mockRecommendations: RecommendationRecord[] = [
  {
    id: 'rec-fm-low-kpi',
    alertId: 'alert-fm-low-kpi',
    ruleId: 'rule-low-kpi',
    alertBasis:
      'Bootcamp indicator is at 64%, below the configured 70% threshold for more than 7 days.',
    ruleExplanation:
      'When KPI achievement falls below target for the review window, a critical alert is raised for human review.',
    text: 'Review participant outreach strategy and intensify vocational track engagement.',
    reviewStatus: 'New',
  },
  {
    id: 'rec-fm-bootcamp',
    alertId: 'alert-fm-bootcamp',
    ruleId: 'rule-combined-health',
    alertBasis: 'Bootcamp progress crossed a checkpoint threshold and is ready for staff review.',
    ruleExplanation:
      'Combined project-health checks compare KPI achievement, budget utilization, and project health.',
    text: 'Review bootcamp progress evidence and decide whether the next cohort support package should proceed.',
    reviewStatus: 'New',
  },
  {
    id: 'rec-yr-site-delay',
    alertId: 'alert-yr-site-delay',
    ruleId: 'rule-delayed-activity',
    alertBasis: 'The site-readiness activity is overdue and below the expected progress threshold.',
    ruleExplanation:
      'Delayed activity rules flag activities that are overdue or not submitted for review by the configured date.',
    text: 'Review site readiness blockers and confirm whether additional field support is needed.',
    reviewStatus: 'New',
  },
  {
    id: 'rec-ss-budget',
    alertId: 'alert-ss-budget',
    ruleId: 'rule-budget-concern',
    alertBasis: 'Budget utilization is 86% while project health is critical.',
    ruleExplanation:
      'Budget rules flag high utilization when project progress or health signals require human attention.',
    text: 'Compare spending against approved activity plans before authorizing additional releases.',
    reviewStatus: 'Reviewed',
    outcome: 'Partially Accept',
    outcomeNote: 'Review release schedule while continuing urgent protection activities.',
  },
  {
    id: 'rec-nav-stalled-stage',
    alertId: 'alert-nav-stalled-stage',
    ruleId: 'rule-stalled-beneficiary-progress',
    alertBasis:
      'No mapped participation was recorded for the coded cohort during the review period.',
    ruleExplanation:
      'Beneficiary progress rules check aggregate participation signals without exposing beneficiary-sensitive details.',
    text: 'Schedule a follow-up session and update the beneficiary progress record.',
    reviewStatus: 'Actioned',
    outcome: 'Decline',
    outcomeNote: 'Staff confirmed the follow-up is already scheduled through a separate workflow.',
  },
  {
    id: 'rec-yr-survey-improvement',
    alertId: 'alert-yr-survey-improvement',
    ruleId: 'rule-low-survey-improvement',
    alertBasis:
      'Survey improvement increased after a later assessment batch and no longer meets the alert condition.',
    ruleExplanation:
      'Assessment rules compare survey improvement against configured minimum improvement thresholds.',
    text: 'Review assessment instrument quality and re-evaluate training delivery method.',
    reviewStatus: 'Reviewed',
  },
]
