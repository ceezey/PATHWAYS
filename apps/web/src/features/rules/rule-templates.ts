import type { RuleNode } from '@pathways/shared'

export type RuleTemplateSpec = {
  key: string
  name: string
  available: boolean
  unavailableReason?: string
  build?: () => {
    name: string
    code: string
    severity: 'CRITICAL' | null
    conditions: RuleNode
    recommendations: { id: string; title: string; text: string }[]
  }
}
export const ruleTemplates: RuleTemplateSpec[] = [
  {
    key: 'OPERATIONS_BOTTLENECK',
    name: 'Operations Bottleneck',
    available: true,
    build: () => ({
      name: 'Operations Bottleneck',
      code: 'OPERATIONS_BOTTLENECK',
      severity: null,
      conditions: {
        kind: 'GROUP',
        mode: 'AND',
        children: [
          {
            kind: 'CONDITION',
            id: `c_${crypto.randomUUID().replaceAll('-', '')}`,
            metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT',
            operator: 'GT',
            threshold: '50',
          },
          {
            kind: 'CONDITION',
            id: `c_${crypto.randomUUID().replaceAll('-', '')}`,
            metric: 'ACTIVITY_COMPLETION_PERCENT',
            operator: 'LT',
            threshold: '40',
          },
        ],
      },
      recommendations: [
        {
          id: crypto.randomUUID(),
          title: 'Review activity schedule',
          text: 'Review dependencies in the activity schedule. Consider allocating additional field staff or adjusting milestone dates.',
        },
      ],
    }),
  },
  {
    key: 'FINANCIAL_EFFICIENCY_RISK',
    name: 'Financial Efficiency Risk',
    available: false,
    unavailableReason: 'Requires a rule template that is not yet available',
  },
  {
    key: 'BUDGET_UNDER_UTILIZATION',
    name: 'Budget Under-utilization',
    available: false,
    unavailableReason: 'Requires a rule template that is not yet available',
  },
  {
    key: 'IDEAL_VECTOR',
    name: 'Ideal Vector',
    available: false,
    unavailableReason: 'Requires a rule template that is not yet available',
  },
]
