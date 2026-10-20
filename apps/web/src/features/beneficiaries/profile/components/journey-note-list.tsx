'use client'

import { StatusBadge } from '@/components/pathways/status-badge'
import type { BeneficiaryNoteRecord } from '@/types/pathways'

import { formatDate } from '../../beneficiaries.utils'

export const JourneyNoteList = ({
  description,
  notes,
  title,
}: {
  description?: string
  notes: BeneficiaryNoteRecord[]
  title: string
}) => (
  <section className="rounded-lg border border-border bg-card p-4">
    <h5 className="font-semibold text-foreground">{title}</h5>
    {description ? (
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    ) : null}
    <div className="mt-3 space-y-2">
      {notes.length > 0 ? (
        notes.map((note) => (
          <div className="rounded-lg border border-border bg-surface-subtle p-3" key={note.id}>
            <StatusBadge tone="neutral">{note.visibility}</StatusBadge>
            <p className="mt-2 text-sm leading-6 text-foreground">{note.note}</p>
            {note.journeyNote ? (
              <p className="mt-2 rounded-lg border border-border bg-card p-3 text-sm leading-6 text-foreground">
                {note.journeyNote}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {note.author} · {formatDate(note.createdAt)}
            </p>
          </div>
        ))
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          No notes have been added for this journey stage.
        </p>
      )}
    </div>
  </section>
)
