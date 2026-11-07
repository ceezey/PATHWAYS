'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { coverageNotice, mappingBarLines } from '../../collection.copy'

function PrepareFormOffer({
  canPrepare,
  busy,
  onPrepare,
}: {
  canPrepare: boolean
  busy: boolean
  onPrepare: () => void
}) {
  return canPrepare ? (
    <Button className="min-h-11" disabled={busy} onClick={onPrepare}>
      Prepare form
    </Button>
  ) : (
    <p className="text-muted-foreground">
      Someone who manages forms can prepare the form from this file.
    </p>
  )
}

// Tells the person a staged file needs the form updated first and, for a form manager, offers to prepare it.
export function StagedCoverageNotice({
  receipt,
  canPrepare,
  pending,
  onPrepare,
}: {
  receipt: { uncoveredColumns: number; unresolvedValues: number }
  canPrepare: boolean
  pending: boolean
  onPrepare: () => void
}) {
  return (
    <div className="space-y-2 rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm">
      <p className="font-medium text-warning">{coverageNotice(receipt)}</p>
      <PrepareFormOffer canPrepare={canPrepare} busy={pending} onPrepare={onPrepare} />
    </div>
  )
}

// The mapping step's bar: it follows the person's decisions, warns while a column is pending and is hidden when nothing is open.
export function CoverageNotice({
  pending,
  personIgnored,
  unmatchedColumns,
  canPrepare,
  busy,
  onPrepare,
}: {
  pending: number
  personIgnored: number
  unmatchedColumns: number
  canPrepare: boolean
  // True while a request is running, so Prepare form waits.
  busy: boolean
  onPrepare: () => void
}) {
  const lines = mappingBarLines({ pending, personIgnored, unmatchedColumns }, canPrepare)
  if (!lines.length) return null
  const warn = pending > 0
  return (
    <section
      aria-label="Mapping decisions"
      className={cn(
        'space-y-2 rounded-lg border p-3 text-sm',
        warn ? 'border-warning/30 bg-warning-subtle' : 'border-border bg-surface-subtle',
      )}
    >
      {lines.map((line) => (
        <p key={line} className={cn('font-medium', warn ? 'text-warning' : 'text-foreground')}>
          {line}
        </p>
      ))}
      <PrepareFormOffer canPrepare={canPrepare} busy={busy} onPrepare={onPrepare} />
    </section>
  )
}
