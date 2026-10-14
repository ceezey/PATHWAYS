'use client'

import { ProgressBar, SectionCard, StatusBadge } from '@/components/pathways'

import type { ParsedImport } from '../../collection.utils'
import type { MappingReadiness } from '../collection-import-state'
import { SummaryPill } from './summary-pill'

export const ImportValidationPanel = ({
  canProceed,
  mappingReadiness,
  parsedImport,
}: {
  canProceed: boolean
  mappingReadiness: MappingReadiness
  parsedImport: ParsedImport | null
}) => {
  const { ignored, invalid, mapped, resolved, total, unmapped } = mappingReadiness
  const progress = total === 0 ? 0 : Math.round((resolved / total) * 100)

  return (
    <SectionCard
      title="Validation summary"
      description="Column and row checks"
      actions={
        <StatusBadge
          tone={
            invalid > 0
              ? 'danger'
              : !canProceed && parsedImport
                ? 'warning'
                : parsedImport
                  ? 'success'
                  : 'neutral'
          }
        >
          {parsedImport ? (canProceed ? 'Ready to proceed' : 'Needs review') : 'Waiting'}
        </StatusBadge>
      }
    >
      <div className="space-y-3">
        <ProgressBar label="Resolved columns" value={progress} />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <SummaryPill label="Mapped" tone="success" value={mapped} />
          <SummaryPill label="Unmapped" tone="warning" value={unmapped} />
          <SummaryPill label="Ignored" tone="neutral" value={ignored} />
          <SummaryPill label="Invalid" tone="danger" value={invalid} />
        </div>
        <p className="rounded-md bg-surface-subtle p-3 text-xs leading-5 text-muted-foreground">
          Validation checks column headings and preview rows before import.
        </p>
      </div>
    </SectionCard>
  )
}
