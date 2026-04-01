import { formatPmerlRows } from '@pathways/imports'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const previewRows = formatPmerlRows([
  {
    reporting_period: '2026-Q1',
    indicator_code: 'PR-101',
    indicator_value: 124,
    disaggregation: 'Women 18-24',
  },
])

export const PmerlPreview = () => (
  <Card>
    <CardHeader>
      <CardTitle>PMERL export placeholder</CardTitle>
    </CardHeader>
    <CardContent>
      <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
        {JSON.stringify(previewRows, null, 2)}
      </pre>
    </CardContent>
  </Card>
)
