'use client'

import { cn } from '@/lib/utils'
import type { Rec } from '../rules.utils'

export function RulePreview({
  sentence,
  name,
  critical,
  mode,
  condition,
  recommendation,
}: {
  sentence: string
  name: string
  critical: boolean
  mode: 'alert' | 'recommendation'
  condition: string
  recommendation: Rec | undefined
}) {
  return (
    <section className="min-h-32 space-y-3 rounded-md border border-info/30 bg-info-subtle p-4">
      <div className="space-y-1">
        <h3 className="font-semibold">Rule Preview</h3>
      </div>
      <p className="text-sm" data-testid="rule-preview">
        {sentence}
      </p>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <p
          className={cn(
            'px-3 py-2 text-sm font-semibold',
            critical
              ? 'border-danger/30 bg-danger-subtle text-danger'
              : 'border-border bg-muted text-muted-foreground',
          )}
        >
          {name.trim() || 'Untitled rule'} -{' '}
          {critical ? 'Critical' : 'Severity from actual figures'}
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
