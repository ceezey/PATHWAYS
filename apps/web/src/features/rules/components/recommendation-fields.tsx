'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'
import { type Rec, appendRec, completeRec, newRec } from '../rules.utils'

export function RecommendationFields({
  recs,
  onRecs,
  library = [],
  libraryPending = false,
  hasRule = false,
  onUserEdit,
  hideAddButton = false,
}: {
  recs: Rec[]
  onRecs: React.Dispatch<React.SetStateAction<Rec[]>>
  /** Recommendations already saved on other rules in scope, offered for reuse. */
  library?: Rec[]
  libraryPending?: boolean
  hasRule?: boolean
  onUserEdit?: () => void
  hideAddButton?: boolean
}) {
  // A new rule opens on its first recommendation; a saved rule's recommendations stay collapsed.
  const [editing, setEditing] = useState<string | null>(
    hasRule || !recs[0] ? null : (recs[0].id as string),
  )
  const [libraryOpen, setLibraryOpen] = useState(false)
  const expanded = (item: Rec) => editing === item.id || !completeRec(item)
  const used = new Set(recs.map((item) => `${item.title}\u0000${item.text}`))
  const offered = library
    .filter((item) => completeRec(item) && !used.has(`${item.title}\u0000${item.text}`))
    .filter(
      (item, index, list) =>
        list.findIndex((other) => other.title === item.title && other.text === item.text) === index,
    )
  // Typing keeps the card open until Done, even once both fields are filled.
  const set = (id: string, patch: Partial<Rec>) => {
    onUserEdit?.()
    setEditing(id)
    onRecs((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }
  const add = (item: Rec) => {
    onUserEdit?.()
    onRecs((list) => appendRec(list, item))
    setEditing(completeRec(item) ? null : item.id)
  }
  return (
    <div className="space-y-3">
      {recs.map((item, index) =>
        expanded(item) ? (
          <div
            className="space-y-2 rounded-md border border-border bg-background p-3"
            key={item.id}
          >
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
              {completeRec(item) ? (
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Done
                </Button>
              ) : null}
              {recs.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onUserEdit?.()
                    onRecs((list) => list.filter((row) => row.id !== item.id))
                  }}
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
                onClick={() => {
                  onUserEdit?.()
                  onRecs((list) => list.filter((row) => row.id !== item.id))
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ),
      )}
      <div className="space-y-2 rounded-md border border-border bg-surface-subtle p-3">
        <p className="text-sm font-medium">Recommendation library</p>
        <p className="text-sm text-muted-foreground" id="recommendation-library-description">
          Choose a saved recommendation to copy into this rule. Later edits stay only in this rule.
        </p>
        <Button
          aria-controls="recommendation-library-options"
          aria-describedby="recommendation-library-description"
          aria-expanded={libraryOpen}
          type="button"
          variant="outline"
          onClick={() => setLibraryOpen((open) => !open)}
        >
          {libraryOpen ? 'Hide recommendation library' : 'Choose from recommendation library'}
        </Button>
        {libraryOpen ? (
          <div className="space-y-2" id="recommendation-library-options">
            {libraryPending ? (
              <output className="block text-sm text-muted-foreground">
                Loading saved recommendations you can use in this organization.
              </output>
            ) : offered.length ? (
              <ul className="space-y-2">
                {offered.map((item) => (
                  <li
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
                    key={`${item.title}:${item.text}`}
                  >
                    <span className="flex-1 text-sm font-medium">{item.title}</span>
                    <Button
                      disabled={recs.length >= 10}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        add({ id: crypto.randomUUID(), title: item.title, text: item.text })
                        setLibraryOpen(false)
                      }}
                    >
                      Copy recommendation to this rule
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <output className="block text-sm text-muted-foreground">
                No other saved recommendations are available in this organization yet. Save a rule
                with a recommendation first.
              </output>
            )}
          </div>
        ) : null}
      </div>
      {!hideAddButton ? (
        <Button
          disabled={recs.length >= 10}
          type="button"
          variant="outline"
          onClick={() => add(newRec())}
        >
          Add recommendation
        </Button>
      ) : null}
    </div>
  )
}
