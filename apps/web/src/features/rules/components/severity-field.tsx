'use client'

import { cn } from '@/lib/utils'
import type { HumanRule } from '@pathways/shared'
import { severityCopy } from '../rules.copy'
import { severities } from '../rules.utils'

export function SeverityField({
  mode,
  severity,
  onSeverity,
}: {
  mode: 'alert' | 'recommendation'
  severity: HumanRule['severity']
  onSeverity: (value: HumanRule['severity']) => void
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
      <div className="space-y-1">
        <p className="text-sm font-medium">Time Basis</p>
        <p className="text-sm text-muted-foreground">
          Evaluated when source data changes and on the scheduled sweep
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Notification Recipients</p>
        <p className="text-sm text-muted-foreground">Assigned project users holding alert access</p>
      </div>
    </div>
  )
}
