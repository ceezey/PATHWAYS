import { Activity, FolderKanban, UsersRound } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardPreviewChart } from '@/features/dashboard/dashboard-preview-chart'

const stats = [
  { label: 'Active programs', value: '03', icon: FolderKanban },
  { label: 'Registry records', value: '124', icon: UsersRound },
  { label: 'Pending imports', value: '07', icon: Activity },
]

export default function DashboardHomePage() {
  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Monitoring dashboard shell"
        description="This is the placeholder home for program metrics, registry summaries, import health, and report readiness."
      />
      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{item.label}</CardTitle>
                <Icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight">{item.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sample placeholder values until live queries are connected.
                </p>
              </CardContent>
            </Card>
          )
        })}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard preview</CardTitle>
        </CardHeader>
        <CardContent>
          <DashboardPreviewChart />
        </CardContent>
      </Card>
    </>
  )
}
