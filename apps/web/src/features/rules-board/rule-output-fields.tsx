'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { HumanRule } from '@/features/analytics/rules-human-contract'
import { cn } from '@/lib/utils'
import { type Rec, newRec, severities } from './rule-drawer-shared'

// Each severity carries the reading an officer should take from it, including the
// low end used for progress and milestone insight rather than risk. The picker keeps
// High and Critical apart, so it maps per level rather than reusing severityTone.
const severityCopy: Record<HumanRule['severity'], { label: string; hint: string; tile: string }> = {
  LOW: {
    label: 'Low',
    hint: 'Progress or milestone insight to carry into later planning',
    tile: 'border-border bg-muted text-muted-foreground',
  },
  MEDIUM: {
    label: 'Medium',
    hint: 'Worth reviewing at the next check-in',
    tile: 'border-info/30 bg-info-subtle text-info',
  },
  HIGH: {
    label: 'High',
    hint: 'Needs a response this reporting period',
    tile: 'border-warning/30 bg-warning-subtle text-warning',
  },
  CRITICAL: {
    label: 'Critical',
    hint: 'Needs attention before work continues',
    tile: 'border-danger/30 bg-danger-subtle text-danger',
  },
}

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

export function RecommendationFields({
  recs,
  onRecs,
}: {
  recs: Rec[]
  onRecs: React.Dispatch<React.SetStateAction<Rec[]>>
}) {
  return (
    <div className="space-y-3">
      {recs.map((item, index) => (
        <div className="space-y-2 rounded-md border border-border p-3" key={item.id}>
          <Label htmlFor={`rec-title-${item.id}`}>Recommendation title</Label>
          <Input
            id={`rec-title-${item.id}`}
            maxLength={160}
            value={item.title}
            onChange={(event) =>
              onRecs((list) =>
                list.map((rec, i) => (i === index ? { ...rec, title: event.target.value } : rec)),
              )
            }
          />
          <Label htmlFor={`rec-text-${item.id}`}>Suggested response</Label>
          <Textarea
            id={`rec-text-${item.id}`}
            maxLength={2000}
            value={item.text}
            onChange={(event) =>
              onRecs((list) =>
                list.map((rec, i) => (i === index ? { ...rec, text: event.target.value } : rec)),
              )
            }
          />
          {recs.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onRecs((list) => list.filter((_, i) => i !== index))}
            >
              Remove recommendation
            </Button>
          ) : null}
        </div>
      ))}
      <Button
        disabled={recs.length >= 10}
        type="button"
        variant="outline"
        onClick={() => onRecs((list) => [...list, newRec()])}
      >
        Add recommendation
      </Button>
    </div>
  )
}

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
        <p className="text-xs text-muted-foreground">Updates as you fill in the steps</p>
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
