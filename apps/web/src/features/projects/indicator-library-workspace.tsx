'use client'

import { LibraryBig, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type IndicatorDefinition = {
  code: string
  name: string
  definition: string
  unit: string
  cadence: string
  source: string
  disaggregation: string[]
  projects: string[]
  status: 'Active' | 'Draft'
}

const indicators: IndicatorDefinition[] = [
  {
    code: 'IND-TRN-01',
    name: 'Youth completing vocational training',
    definition:
      'Count of enrolled youth who complete every required session in the assigned training sequence.',
    unit: 'People',
    cadence: 'Monthly',
    source: 'Attendance and completion records',
    disaggregation: ['Sex', 'Age group', 'Disability status'],
    projects: ['FutureMakers NCR', 'Youth RISE - Western Samar'],
    status: 'Active',
  },
  {
    code: 'IND-LRN-03',
    name: 'Average assessment improvement',
    definition:
      'Mean percentage-point difference between matched pre-assessment and post-assessment scores.',
    unit: 'Percentage points',
    cadence: 'Per cohort',
    source: 'Matched assessment records',
    disaggregation: ['Sex', 'Age group'],
    projects: ['FutureMakers NCR'],
    status: 'Active',
  },
  {
    code: 'IND-REF-02',
    name: 'Referrals receiving follow-up',
    definition:
      'Share of beneficiaries with a recorded follow-up within the approved service interval.',
    unit: 'Percent',
    cadence: 'Quarterly',
    source: 'Journey follow-up records',
    disaggregation: ['Location', 'Age group', 'Disability status'],
    projects: ['Safe Spaces - Northern Samar'],
    status: 'Draft',
  },
]

import { ConnectedIndicatorWorkspace } from './connected-delivery-workspace'
export const IndicatorLibraryWorkspace = ConnectedIndicatorWorkspace
const LegacyIndicatorLibraryWorkspace = () => {
  const [query, setQuery] = useState('')
  const [selectedCode, setSelectedCode] = useState(indicators[0]?.code ?? '')
  const visibleIndicators = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? indicators.filter((indicator) =>
          [indicator.code, indicator.name, indicator.definition].some((value) =>
            value.toLocaleLowerCase().includes(normalized),
          ),
        )
      : indicators
  }, [query])
  const selected =
    indicators.find((indicator) => indicator.code === selectedCode) ?? visibleIndicators[0]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoring foundation"
        title="Indicator Library"
        description="Review reusable indicator definitions separately from each project's measured values and targets."
      />

      <div className="rounded-lg border border-info/25 bg-info-subtle px-4 py-3 text-sm leading-6 text-info">
        Definitions and assignments are synthetic preview data. Editing and project assignment
        require a connected indicator service and durable authorization.
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard
          title="Definitions"
          description={`${visibleIndicators.length} reusable definition${visibleIndicators.length === 1 ? '' : 's'} shown.`}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="indicator-search">Search indicators</Label>
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="indicator-search"
                  className="pl-9"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
            </div>
            {visibleIndicators.length ? (
              <div className="space-y-2">
                {visibleIndicators.map((indicator) => (
                  <button
                    key={indicator.code}
                    type="button"
                    onClick={() => setSelectedCode(indicator.code)}
                    className={`w-full rounded-md border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selected?.code === indicator.code ? 'border-primary bg-primary-subtle' : 'border-border bg-card hover:border-primary/40'}`}
                    aria-pressed={selected?.code === indicator.code}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                          {indicator.code}
                        </p>
                        <p className="mt-1 font-semibold text-foreground">{indicator.name}</p>
                      </div>
                      <StatusBadge tone={indicator.status === 'Active' ? 'success' : 'neutral'}>
                        {indicator.status}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {indicator.definition}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={LibraryBig}
                title="No indicators match"
                description="Try a code, name, or definition keyword."
              />
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={selected?.name ?? 'Indicator detail'}
          description="Definition, calculation context, and current preview assignments."
        >
          {selected ? (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {selected.code}
                </p>
                <p className="mt-2 text-sm leading-6">{selected.definition}</p>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">Unit</dt>
                  <dd className="mt-1 font-medium">{selected.unit}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Cadence</dt>
                  <dd className="mt-1 font-medium">{selected.cadence}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm text-muted-foreground">Source</dt>
                  <dd className="mt-1 font-medium">{selected.source}</dd>
                </div>
              </dl>
              <div>
                <h2 className="text-sm font-semibold">Required disaggregation</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.disaggregation.map((item) => (
                    <StatusBadge key={item} tone="neutral">
                      {item}
                    </StatusBadge>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold">Assigned projects</h2>
                <ul className="mt-2 divide-y rounded-md border">
                  {selected.projects.map((project) => (
                    <li key={project} className="px-4 py-3 text-sm">
                      {project}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  )
}
