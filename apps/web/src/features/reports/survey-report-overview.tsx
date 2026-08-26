import type {
  Activity,
  JourneyStageConfig,
  ProjectDetail,
  SurveyAggregateResultSet,
  SurveyFormDefinition,
} from '@/types/pathways'

type SurveyReportOverviewProps = {
  activity?: Activity
  compact?: boolean
  form: SurveyFormDefinition
  journeyStage?: JourneyStageConfig
  project?: ProjectDetail
  result: SurveyAggregateResultSet
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))

const formatBreakdown = (count: number, total: number) => {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0
  return `${count} (${percentage}%)`
}

export const SurveyReportOverview = ({
  activity,
  compact = false,
  form,
  journeyStage,
  project,
  result,
}: SurveyReportOverviewProps) => (
  <section
    aria-label="Selected survey report context"
    className="space-y-4 rounded-lg border border-info/20 bg-info/5 p-4"
  >
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-info">
          Aggregate survey results
        </p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">{form.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Synthetic aggregate mock data only. No individual responses or Beneficiary identities are
          included.
        </p>
      </div>
      <div className="rounded-md border border-info/20 bg-background px-4 py-3 text-center">
        <p className="text-2xl font-semibold text-foreground">{result.responseCount}</p>
        <p className="text-xs text-muted-foreground">Responses</p>
      </div>
    </div>

    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <ContextItem label="Program" value={form.programName} />
      <ContextItem label="Project" value={project?.title ?? 'Project not mapped'} />
      <ContextItem label="Form type" value={form.formType} />
      <ContextItem label="Location" value={result.location} />
      <ContextItem label="Exact response date" value={formatDate(result.responseDate)} />
      <ContextItem label="Reporting period" value={result.reportingPeriod} />
      <ContextItem
        label="Journey stage"
        value={journeyStage ? `${journeyStage.code} - ${journeyStage.name}` : 'Not linked'}
      />
      <ContextItem label="Linked activity" value={activity?.title ?? 'Not linked'} />
    </dl>

    {!compact && result.demographicBreakdowns.length > 0 ? (
      <div className="grid gap-3 md:grid-cols-2">
        {result.demographicBreakdowns.map((breakdown) => (
          <div key={breakdown.dimension} className="rounded-md border border-border bg-card p-3">
            <p className="text-sm font-medium text-foreground">{breakdown.dimension}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {breakdown.values.map((value) => (
                <li key={value.label} className="flex items-center justify-between gap-3">
                  <span>{value.label}</span>
                  <span className="font-medium text-foreground">
                    {formatBreakdown(value.count, result.responseCount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ) : null}
  </section>
)

const ContextItem = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border bg-card p-3">
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-1 font-medium text-foreground">{value}</dd>
  </div>
)
