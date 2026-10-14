'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'
import { type Rec, newRec } from '../rules.utils'

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
