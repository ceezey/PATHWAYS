'use client'

import { cn } from '@/lib/utils'
import type { HumanRule } from '@pathways/shared'
import { severityCopy } from '../rules.copy'
import type { Rec } from '../rules.utils'

export function RulePreview({
  sentence,
  name,
  severity,
  mode,
  condition,
  recommendation,
}: {
  sentence: string
  name: string
  severity: HumanRule['severity']
  mode: 'alert' | 'recommendation'
  condition: string
  recommendation: Rec | undefined
}) {
  const copy = severityCopy[severity]
  return (
    <section className="min-h-32 space-y-3 rounded-md border border-info/30 bg-info-subtle p-4">
      <div className="space-y-1">
        <h3 className="font-semibold">Rule Preview</h3>
      </div>
      <p className="text-sm" data-testid="rule-preview">
        {sentence}
      </p>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <p className={cn('px-3 py-2 text-sm font-semibold', copy.tile)}>
          {name.trim() || 'Untitled rule'} - {copy.label}
        </p>
        <p className="px-3 py-2 text-sm">
          {mode === 'alert' ? 'Condition met' : 'Insight recorded'}:{' '}
          {condition || 'No conditions yet'}
        </p>
        <p className="border-t border-border px-3 py-2 text-sm">
          <strong>Recommendation:</strong>{' '}
          {recommendation?.text.trim() ||
            recommendation?.title.trim() ||
            'Add a suggested response in the recommendation step.'}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Rule outputs are rule-based and need human review; nothing is executed automatically.
      </p>
    </section>
  )
}
