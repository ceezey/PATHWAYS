'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { HumanRule } from '@/features/analytics/rules-human-contract'
import { type Rec, newRec, selectClass, severities } from './rule-drawer-shared'

type Props = {
  mode: 'alert' | 'recommendation'
  severity: HumanRule['severity']
  onSeverity: (value: HumanRule['severity']) => void
  recs: Rec[]
  onRecs: React.Dispatch<React.SetStateAction<Rec[]>>
}
export function RuleOutputFields({ mode, severity, onSeverity, recs, onRecs }: Props) {
  const recsInput = (
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
  return (
    <>
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">Time Basis</p>
            <p className="text-sm text-muted-foreground">
              Evaluated when source data changes and on the scheduled sweep
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-severity">
              {mode === 'alert' ? 'Severity' : 'Triggering alert severity'}
            </Label>
            <select
              className={selectClass}
              id="rule-severity"
              value={severity}
              onChange={(event) => onSeverity(event.target.value as HumanRule['severity'])}
            >
              {severities.map((item) => (
                <option key={item} value={item}>
                  {item.charAt(0) + item.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Notification Recipients</p>
          <p className="text-sm text-muted-foreground">
            Assigned project users holding alert access
          </p>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">
          {mode === 'recommendation' ? 'Recommendation' : 'Predefined recommendations'}
        </h3>
        {recsInput}
      </section>
    </>
  )
}

export function RulePreview({ sentence }: { sentence: string }) {
  return (
    <section className="min-h-32 space-y-2 rounded-md border border-info/30 bg-info-subtle p-4">
      <h3 className="font-semibold">Rule Preview</h3>
      <p className="text-sm" data-testid="rule-preview">
        {sentence}
      </p>
      <p className="text-xs text-muted-foreground">
        Rule outputs are rule-based and need human review; nothing is executed automatically.
      </p>
    </section>
  )
}
