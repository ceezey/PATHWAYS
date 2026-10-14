'use client'

import { SectionCard } from '@/components/pathways'
import { Label } from '@/components/ui/label'

import { type FormField, dataTypeLabels } from '../../collection.utils'

export const FormPreviewPanel = ({
  fields,
  formTitle,
}: { fields: FormField[]; formTitle: string }) => (
  <SectionCard title="Form preview" description={formTitle}>
    <div className="space-y-3">
      {fields.slice(0, 4).map((field) => (
        <div key={field.id} className="rounded-md border bg-surface-subtle p-3">
          <Label>{field.label}</Label>
          <div className="mt-2 h-9 rounded-sm border bg-background px-3 py-2 text-xs text-muted-foreground">
            {field.type.includes('select')
              ? field.allowedValues.join(', ') || 'Option 1, Option 2'
              : dataTypeLabels[field.type]}
          </div>
        </div>
      ))}
    </div>
  </SectionCard>
)
