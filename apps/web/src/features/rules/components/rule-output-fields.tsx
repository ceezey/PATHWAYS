'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { HumanRule } from '@pathways/shared'
import { useState } from 'react'
import { type Rec, newRec, severities } from '../rule-drawer-shared'

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

const complete = (item: Rec) => Boolean(item.title.trim() && item.text.trim())

export function RecommendationFields({
  recs,
  onRecs,
  library = [],
  hasRule = false,
}: {
  recs: Rec[]
  onRecs: React.Dispatch<React.SetStateAction<Rec[]>>
  /** Recommendations already saved on other rules in scope, offered for reuse. */
  library?: Rec[]
  hasRule?: boolean
}) {
  // A new rule opens on its first recommendation; a saved rule's recommendations stay collapsed.
  const [editing, setEditing] = useState<string | null>(
    hasRule || !recs[0] ? null : (recs[0].id as string),
  )
  const expanded = (item: Rec) => editing === item.id || !complete(item)
  const used = new Set(recs.map((item) => `${item.title}\u0000${item.text}`))
  const offered = library
    .filter((item) => complete(item) && !used.has(`${item.title}\u0000${item.text}`))
    .filter(
      (item, index, list) =>
        list.findIndex((other) => other.title === item.title && other.text === item.text) === index,
    )
  const set = (id: string, patch: Partial<Rec>) =>
    onRecs((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const add = (item: Rec) => {
    onRecs((list) => (list.length === 1 && !complete(list[0] as Rec) ? [item] : [...list, item]))
    setEditing(complete(item) ? null : item.id)
  }
  return (
    <div className="space-y-3">
      {recs.map((item, index) =>
        expanded(item) ? (
          <div className="space-y-2 rounded-md border border-border p-3" key={item.id}>
            <Label htmlFor={`rec-title-${item.id}`}>Recommendation title</Label>
            <Input
              id={`rec-title-${item.id}`}
              maxLength={160}
              value={item.title}
              onChange={(event) => set(item.id, { title: event.target.value })}
            />
            <Label htmlFor={`rec-text-${item.id}`}>Suggested response</Label>
            <Textarea
              id={`rec-text-${item.id}`}
              maxLength={2000}
              value={item.text}
              onChange={(event) => set(item.id, { text: event.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              {complete(item) ? (
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Done
                </Button>
              ) : null}
              {recs.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onRecs((list) => list.filter((row) => row.id !== item.id))}
                >
                  Remove recommendation
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
            key={item.id}
          >
            <span className="flex-1 text-sm font-medium">{item.title}</span>
            <Button
              aria-label={`Edit recommendation ${index + 1}`}
              type="button"
              variant="outline"
              onClick={() => setEditing(item.id)}
            >
              Edit
            </Button>
            {recs.length > 1 ? (
              <Button
                aria-label={`Remove recommendation ${index + 1}`}
                type="button"
                variant="outline"
                onClick={() => onRecs((list) => list.filter((row) => row.id !== item.id))}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ),
      )}
      <Button
        disabled={recs.length >= 10}
        type="button"
        variant="outline"
        onClick={() => add(newRec())}
      >
        Add recommendation
      </Button>
      {offered.length && recs.length < 10 ? (
        <div className="space-y-2 rounded-md border border-border bg-surface-subtle p-3">
          <p className="text-sm font-medium">Reuse a saved recommendation</p>
          <p className="text-sm text-muted-foreground">
            Copied into this rule, so later edits here do not change the rule it came from.
          </p>
          <ul className="space-y-2">
            {offered.map((item) => (
              <li className="flex flex-wrap items-center gap-2" key={`${item.title}:${item.text}`}>
                <span className="flex-1 text-sm">{item.title}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    add({ id: crypto.randomUUID(), title: item.title, text: item.text })
                  }
                >
                  Reuse
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
