import type { HumanRule } from '@/features/analytics/rules-human-contract'
import type { RuleCondition } from '@/features/analytics/rules-validation'

export const selectClass =
  'h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-disabled-foreground'
export type Rec = { id: string; title: string; text: string }
export type Mode = 'AND' | 'OR'
export const severities: readonly HumanRule['severity'][] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const recordBound = (metric: string) =>
  metric.startsWith('INDICATOR_') || metric === 'ACTIVITY_OVERDUE_DAYS'
export const newRow = (metric: string): RuleCondition => ({
  kind: 'CONDITION',
  id: `c_${crypto.randomUUID().replaceAll('-', '')}`,
  metric: metric as RuleCondition['metric'],
  operator: 'LT',
  threshold: '',
})
export const newRec = (): Rec => ({ id: crypto.randomUUID(), title: '', text: '' })
export const DEFAULT_REC = {
  title: 'Review flagged condition',
  text: 'Review the recorded evidence and decide on a response.',
}
