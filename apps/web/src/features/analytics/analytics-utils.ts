import type {
  AlertLifecycleStatus,
  AlertRecord,
  RuleDefinition,
  RuleSeverity,
} from '@/types/pathways'

export const humanReviewDisclaimer =
  'Recommendations are generated from predefined rules and require human review.'

export const formatPercent = (value: number) => `${Math.round(value)}%`

export const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value)

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))

export const alertSeverityTone = (severity: AlertRecord['severity']) => {
  switch (severity) {
    case 'Critical':
      return 'danger'
    case 'Warning':
      return 'warning'
    case 'Information':
      return 'info'
    default:
      return 'neutral'
  }
}

export const ruleSeverityTone = (severity: RuleSeverity) => {
  switch (severity) {
    case 'Critical':
      return 'danger'
    case 'High':
      return 'warning'
    case 'Medium':
      return 'info'
    case 'Low':
      return 'neutral'
    default:
      return 'neutral'
  }
}

export const lifecycleTone = (status: AlertLifecycleStatus) => {
  switch (status) {
    case 'New':
      return 'warning'
    case 'Reviewed':
      return 'info'
    case 'Actioned':
    case 'Resolved':
    case 'Auto-resolved':
      return 'success'
    case 'Dismissed':
      return 'neutral'
    default:
      return 'neutral'
  }
}

export const ruleStatusTone = (status: RuleDefinition['status']) =>
  status === 'Active' ? 'success' : 'neutral'

export const operatorCopy = (operator: RuleDefinition['operator']) => {
  switch (operator) {
    case 'below':
      return 'falls below'
    case 'above':
      return 'rises above'
    case 'between':
      return 'is between'
    case 'equals':
      return 'equals'
    default:
      return operator
  }
}
