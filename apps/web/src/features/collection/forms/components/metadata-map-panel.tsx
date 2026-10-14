'use client'

import { ProgressBar, SectionCard } from '@/components/pathways'

import type { FormField } from '../../collection.utils'

export const MetadataMapPanel = ({
  fields,
  mappedCount,
  metadataCoverage,
  selectedField,
  selectedProject,
}: {
  fields: FormField[]
  mappedCount: number
  metadataCoverage: number
  selectedField?: FormField
  selectedProject: string
}) => (
  <SectionCard title="Metadata map" description="Current field summary">
    <div className="space-y-3 text-sm">
      <div className="rounded-md bg-surface-subtle p-3">
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>Total fields</span>
          <span className="text-right font-medium text-foreground">{fields.length}</span>
          <span>Mapped</span>
          <span className="text-right font-medium text-success">{mappedCount}</span>
          <span>Unmapped</span>
          <span className="text-right font-medium text-warning">
            {fields.filter((field) => field.mappingStatus === 'unmapped').length}
          </span>
          <span>Invalid</span>
          <span className="text-right font-medium text-danger">
            {fields.filter((field) => field.mappingStatus === 'invalid').length}
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar label="Metadata coverage" value={metadataCoverage} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">Selected field</p>
        <div className="mt-2 rounded-md border bg-surface-subtle p-3">
          <p className="font-medium text-foreground">
            {selectedField?.label ?? 'No field selected'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedField
              ? `Maps to ${selectedField.code} in ${selectedProject}.`
              : 'Choose a field to inspect metadata links.'}
          </p>
        </div>
      </div>
    </div>
  </SectionCard>
)
