'use client'

import { X } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'

import { Button } from '@/components/ui/button'
import {
  AnalyticsCoverageMap,
  ChartPanel,
  IndicatorProgressChart,
  ParticipationBreakdownPanel,
  SadddChart,
  UnavailableChart,
  progressRows,
  toProjectMapFeatures,
} from '@/features/analytics'
import { overviewMetricLabel } from '@/features/projects'
import type { PublicAnalyticsResponse, PublicView } from '@pathways/shared'

import { shell } from './public-sections'

type Body<V extends PublicView> = Extract<PublicAnalyticsResponse, { view: V }>

const titles: Record<PublicView, string> = {
  kpi: 'Indicator progress',
  saddd: 'People reached',
  participation: 'Participation',
  timeline: 'Timeline',
  map: 'Where the project works',
}

const SadddBreakdown = ({ body }: { body: Body<'saddd'> }) => (
  <div className="space-y-4">
    <p className="text-sm font-medium text-foreground">
      Total people reached:{' '}
      <span className="tabular-nums">{overviewMetricLabel(body.total, 'count')}</span>
    </p>
    <div className="grid gap-6 lg:grid-cols-3">
      {[
        { label: 'Sex', buckets: body.sex },
        { label: 'Age', buckets: body.age },
        { label: 'Disability', buckets: body.disability },
      ].map((group) => (
        <section aria-label={group.label} key={group.label}>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{group.label}</h3>
          <SadddChart {...group} />
        </section>
      ))}
    </div>
  </div>
)

const Timeline = ({ body }: { body: Body<'timeline'> }) => (
  <dl className="grid gap-3 text-sm sm:grid-cols-3">
    {[
      { label: 'Elapsed', value: overviewMetricLabel(body.elapsedPercent, 'percent') },
      {
        label: 'Activity completion',
        value: overviewMetricLabel(body.activityCompletionPercent, 'percent'),
      },
      {
        label: 'Overdue activities',
        value: overviewMetricLabel(body.activityOverdueCount, 'count'),
      },
    ].map((row) => (
      <div key={row.label}>
        <dt className="text-muted-foreground">{row.label}</dt>
        <dd className="mt-1 font-medium tabular-nums text-foreground">{row.value}</dd>
      </div>
    ))}
  </dl>
)

// The map takes the shared project-map shape; one stub project holds this page's places.
const PlacesMap = ({ places }: { places: Body<'map'>['places'] }) => {
  const features = useMemo(
    () =>
      toProjectMapFeatures({
        contractVersion: 'analytics.project-map.v1',
        generatedAt: new Date(0).toISOString(),
        unmappedCount: 0,
        projects: [
          {
            id: 'public',
            code: '',
            title: '',
            status: '',
            implementationArea: '',
            places,
            overview: null,
            sadddSex: null,
            sadddDisability: null,
          },
        ],
      }),
    [places],
  )
  return (
    <AnalyticsCoverageMap
      emptyDescription="No mapped places are available for this project."
      featureCollection={features}
      renderPopup={(point, close) => {
        // Point keys end in the place index.
        const place = places[Number(point.key.slice(point.key.lastIndexOf(':') + 1))]
        return place ? (
          <div className="w-56 max-w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-foreground">{place.name}</p>
              <Button
                aria-label="Close place overview"
                onClick={close}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
            {place.reach ? (
              <p className="mt-1 text-sm text-muted-foreground">
                People reached:{' '}
                <span className="font-medium tabular-nums text-foreground">
                  {overviewMetricLabel(place.reach.total, 'count')}
                </span>
              </p>
            ) : null}
          </div>
        ) : null
      }}
    />
  )
}

const body = (
  view: PublicView,
  response: PublicAnalyticsResponse | null | undefined,
): ReactNode => {
  if (!response || response.view !== view)
    return <UnavailableChart description="This chart could not be loaded right now." />
  switch (response.view) {
    case 'kpi': {
      const rows = progressRows(response.indicators)
      return rows.length ? (
        <IndicatorProgressChart rows={rows} />
      ) : (
        <UnavailableChart
          description="No indicator progress has been released yet."
          title="None yet"
        />
      )
    }
    case 'saddd':
      return <SadddBreakdown body={response} />
    case 'participation':
      return <ParticipationBreakdownPanel data={response} />
    case 'timeline':
      return <Timeline body={response} />
    case 'map':
      return <PlacesMap places={response.places} />
  }
}

// The live charts a published page chose, one card per view; a failed view shows only its own notice.
export const PublicProgress = ({
  views,
  data,
  placeholder,
}: {
  views: PublicView[]
  data?: Partial<Record<PublicView, PublicAnalyticsResponse | null>>
  placeholder?: boolean
}) =>
  views.length === 0 ? null : (
    <section className={`${shell} pb-8 sm:pb-12`}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Project progress
          </h2>
          <span className="rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary">
            Live
          </span>
        </div>
        {views.map((view) => (
          <ChartPanel key={view} title={titles[view]}>
            {placeholder ? (
              <p className="text-sm text-muted-foreground">
                Live chart appears here once published
              </p>
            ) : (
              body(view, data?.[view])
            )}
          </ChartPanel>
        ))}
      </div>
    </section>
  )
