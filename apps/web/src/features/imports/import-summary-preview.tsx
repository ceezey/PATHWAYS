import { compareHeaders, createFileSummary } from '@pathways/imports'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const headers = ['participant_id', 'full_name', 'sex', 'program_code']
const expectedHeaders = ['participant_id', 'full_name', 'age', 'sex', 'program_code']
const rows = [
  { participant_id: 'P-001', full_name: 'Ariella Santos', sex: 'F', program_code: 'YL-01' },
  { participant_id: 'P-002', full_name: 'Daniel Cruz', sex: 'M', program_code: 'CVA-04' },
]

const headerComparison = compareHeaders(expectedHeaders, headers)
const fileSummary = createFileSummary(
  'participant-registry-template.csv',
  'csv',
  headers,
  rows,
  headerComparison.matches
    ? []
    : ['Template headers still need alignment with metadata definitions.'],
)

export const ImportSummaryPreview = () => (
  <Card>
    <CardHeader>
      <CardTitle>Import utility preview</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
      <div className="space-y-2 rounded-xl border border-border/70 bg-muted/40 p-4">
        <p className="font-medium text-foreground">File summary</p>
        <p>{fileSummary.fileName}</p>
        <p>{fileSummary.totalRows} rows detected</p>
        <p>{fileSummary.totalColumns} columns detected</p>
      </div>
      <div className="space-y-2 rounded-xl border border-border/70 bg-muted/40 p-4">
        <p className="font-medium text-foreground">Header comparison</p>
        <p>Missing: {headerComparison.missing.join(', ') || 'None'}</p>
        <p>Extra: {headerComparison.extra.join(', ') || 'None'}</p>
      </div>
    </CardContent>
  </Card>
)
