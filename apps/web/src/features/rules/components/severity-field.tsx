'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HumanRule } from '@pathways/shared'
import type { SuggestedSeverity } from '../rule-severity.utils'
import { severityCopy } from '../rules.copy'
import { severities } from '../rules.utils'

export function SeverityField({
  mode,
  severity,
  onSeverity,
  suggestion,
  onUseSuggestion,
}: {
  mode: 'alert' | 'recommendation'
  severity: HumanRule['severity']
  onSeverity: (value: HumanRule['severity']) => void
  suggestion: SuggestedSeverity
  onUseSuggestion: () => void
}) {
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {mode === 'alert' ? 'Severity' : 'Triggering alert severity'}
        </legend>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {severities.map((item) => {
            const copy = severityCopy[item]
            const selected = severity === item
            return (
              <label
                className={cn(
                  'cursor-pointer rounded-md border border-input bg-card p-3 text-sm',
                  'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                  selected && copy.tile,
                )}
                key={item}
              >
                <input
                  checked={selected}
                  className="sr-only"
                  name="drawer-rule-severity"
                  onChange={() => onSeverity(item)}
                  type="radio"
                  value={item}
                />
                <span className={cn('block font-medium', selected && 'font-semibold')}>
                  {copy.label}
                </span>
                <span className="block text-xs text-muted-foreground">{copy.hint}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="space-y-2 rounded-md border border-info/30 bg-info-subtle p-3"
      >
        <p className="text-sm font-medium" data-testid="severity-suggestion">
          {suggestion.status === 'SUGGESTED'
            ? `Suggested severity: ${severityCopy[suggestion.severity].label}`
            : 'Needs your judgment'}
        </p>
        <p className="text-sm text-muted-foreground" id="severity-suggestion-reason">
          {suggestion.reason}
        </p>
        <Button
          aria-describedby="severity-suggestion-reason"
          disabled={suggestion.status !== 'SUGGESTED'}
          type="button"
          variant="outline"
          onClick={onUseSuggestion}
        >
          Use suggestion
        </Button>
      </div>
    </div>
  )
}
