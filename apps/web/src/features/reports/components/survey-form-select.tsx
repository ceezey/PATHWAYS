'use client'

import { AsyncState } from '@/components/pathways'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ReportContext } from '../hooks/use-report-context'

export function SurveyFormSelect({
  context,
}: {
  context: Pick<
    ReportContext,
    'id' | 'kind' | 'forms' | 'currentForms' | 'formId' | 'setSelectedForm'
  >
}) {
  const { id, kind, forms, currentForms, formId, setSelectedForm } = context
  return (
    <>
      {kind === 'SURVEY_FORM_RESULTS' && (
        <div className="space-y-2">
          <Label className="block space-y-2">
            <span>Published training survey</span>
            <Select
              value={formId ?? ''}
              onValueChange={setSelectedForm}
              disabled={!id || forms.isError || forms.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a published survey" />
              </SelectTrigger>
              <SelectContent>
                {currentForms?.map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    {form.name} · version {form.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          {forms.isError && (
            <AsyncState
              status="error"
              title="Survey access unavailable"
              description="Current survey access could not be verified."
              onRetry={() => void forms.refetch()}
            />
          )}
          {id && !forms.isPending && !forms.isError && !currentForms?.length && (
            <p className="text-sm text-muted-foreground">
              No currently published training survey is available.
            </p>
          )}
        </div>
      )}
    </>
  )
}
