'use client'

import { Button } from '@/components/ui/button'

import { coverageNotice } from '../../collection.copy'

// Tells the person a staged file needs the form updated first and, for a form manager, offers to prepare it.
export function CoverageNotice({
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
      {canPrepare ? (
        <Button className="min-h-11" disabled={pending} onClick={onPrepare}>
          Prepare form
        </Button>
      ) : (
        <p className="text-muted-foreground">
          Someone who manages forms can prepare the form from this file.
        </p>
      )}
    </div>
  )
}
