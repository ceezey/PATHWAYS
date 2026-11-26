'use client'

import { type ReactNode, useMemo } from 'react'

import {
  AnalyticsCoverageMap,
  ChartPanel,
  IndicatorProgressChart,
  ParticipationBreakdownPanel,
  PlacePopupCard,
  SadddChart,
  UnavailableChart,
  progressRows,
  toProjectMapFeatures,
} from '@/features/analytics'
import { overviewMetricLabel } from '@/features/projects'
import type { PublicAnalyticsResponse, PublicView } from '@pathways/shared'

import { shell } from './public-sections'
import { smallCounts } from './small-counts'

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
        contractVersion: 'analytics.project-map.v2',
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
        return place ? <PlacePopupCard onClose={close} place={place} /> : null
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

// The approver's marker above one chart: every people count under 5, so a small group is checked before approval.
const SmallCountMarker = ({
  response,
}: { response: PublicAnalyticsResponse | null | undefined }) => {
  const counts = response ? smallCounts(response) : []
  return counts.length ? (
    <div
      className="mb-4 rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm"
      role="note"
    >
      <p className="font-semibold text-foreground">
        Counts under 5: check that none of these can identify a person
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground">
        {counts.map((count) => (
          <li key={count.label}>
            {count.label}: <span className="tabular-nums">{count.value}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null
}

// The live charts a published page chose, one card per view; a failed view shows only its own notice.
// review marks small counts for the approver; the public page never passes it, so it shows exact counts unmarked.
export const PublicProgress = ({
  views,
  data,
  placeholder,
  review,
}: {
  views: PublicView[]
  data?: Partial<Record<PublicView, PublicAnalyticsResponse | null>>
  placeholder?: boolean
  review?: boolean
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
              <>
                {review ? <SmallCountMarker response={data?.[view]} /> : null}
                {body(view, data?.[view])}
              </>
            )}
          </ChartPanel>
        ))}
      </div>
    </section>
  )
