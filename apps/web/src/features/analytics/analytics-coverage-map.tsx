'use client'

import { MapPinned } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { StatusBadge } from '@/components/pathways/status-badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { AnalyticsCoverageStatus, ProjectDetail } from '@/types/pathways'

import {
  type AnalyticsLocationInsight,
  getMapPosition,
  getMarkerSize,
} from './analytics-location-utils'
import { formatNumber } from './analytics-utils'

type AnalyticsCoverageMapProps = {
  locations: AnalyticsLocationInsight[]
  period: string
  projects: ProjectDetail[]
}

const coverageTone = (status: AnalyticsCoverageStatus) => {
  switch (status) {
    case 'Strong':
      return 'success'
    case 'Growing':
      return 'info'
    case 'Limited':
      return 'warning'
    default:
      return 'neutral'
  }
}

const markerToneClasses: Record<AnalyticsCoverageStatus, string> = {
  Strong: 'border-emerald-200 bg-emerald-600 text-white shadow-emerald-950/20',
  Growing: 'border-blue-200 bg-blue-600 text-white shadow-blue-950/20',
  Limited: 'border-amber-200 bg-amber-500 text-slate-950 shadow-amber-950/20',
  Planned: 'border-slate-300 bg-slate-500 text-white shadow-slate-950/20',
}

// Approximate city centroids are deliberately offset within their regional clusters so each
// 44px interaction target remains independently available on the narrow audit working targets.
const collisionAwareMarkerPositions: Record<string, { left: number; top: number }> = {
  'quezon-city': { left: 48, top: 26 },
  manila: { left: 24, top: 41 },
  navotas: { left: 24, top: 26 },
  mandaluyong: { left: 48, top: 41 },
  calbayog: { left: 65, top: 67 },
  catbalogan: { left: 88, top: 67 },
  basey: { left: 78, top: 83 },
  catarman: { left: 70, top: 52 },
  laoang: { left: 90, top: 52 },
}

const tooltipPlacement = (left: number) => {
  if (left <= 30) {
    return 'left-0 translate-x-0'
  }
  if (left >= 70) {
    return 'right-0 left-auto translate-x-0'
  }
  return 'left-1/2 -translate-x-1/2'
}

const coverageSummary = (location: AnalyticsLocationInsight) => {
  switch (location.coverageStatus) {
    case 'Strong':
      return 'Beneficiary reach and delivery-site coverage are established in this location.'
    case 'Growing':
      return 'Coverage is expanding, with additional delivery activity still in progress.'
    case 'Limited':
      return 'Coverage remains limited and may need a site-readiness or delivery follow-up.'
    case 'Planned':
      return 'This location is included in the plan, but delivery has not started in this prototype view.'
  }
}

export const AnalyticsCoverageMap = ({
  locations,
  period,
  projects,
}: AnalyticsCoverageMapProps) => {
  const [detailsLocationId, setDetailsLocationId] = useState<string | null>(null)
  const projectTitles = useMemo(
    () => new Map(projects.map((project) => [project.id, project.title])),
    [projects],
  )
  const detailsLocation = locations.find((location) => location.id === detailsLocationId) ?? null

  useEffect(() => {
    if (detailsLocationId && !locations.some((location) => location.id === detailsLocationId)) {
      setDetailsLocationId(null)
    }
  }, [detailsLocationId, locations])

  return (
    <section
      aria-labelledby="coverage-map-title"
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="border-b border-border bg-muted/30 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Location coverage
              </p>
              <StatusBadge tone="neutral">Prototype map</StatusBadge>
            </div>
            <h2
              className="text-2xl font-semibold tracking-tight text-foreground"
              id="coverage-map-title"
            >
              Project reach by location
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Point to a location for a quick overview, or select it for full details.
            </p>
          </div>
          <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-xs leading-5 text-info lg:max-w-sm">
            {period} prototype view. Points show approximate city-level locations only. Addresses
            and Beneficiary-level locations are not shown.
          </div>
        </div>
      </div>

      {locations.length === 0 ? (
        <div className="p-5">
          <EmptyState
            description="Choose another project to view available city-level coverage information."
            icon={MapPinned}
            title="No mapped location data for this filter"
          />
        </div>
      ) : (
        <div className="p-3 sm:p-5">
          <CoverageMapGraphic
            activeLocationId={detailsLocation?.id ?? null}
            locations={locations}
            onSelect={setDetailsLocationId}
          />
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDetailsLocationId(null)
          }
        }}
        open={Boolean(detailsLocation)}
      >
        {detailsLocation ? (
          <LocationDetailsDialog
            location={detailsLocation}
            period={period}
            projectTitles={projectTitles}
          />
        ) : null}
      </Dialog>
    </section>
  )
}

const CoverageMapGraphic = ({
  activeLocationId,
  locations,
  onSelect,
}: {
  activeLocationId: string | null
  locations: AnalyticsLocationInsight[]
  onSelect: (locationId: string) => void
}) => (
  <div>
    <div className="relative mx-auto aspect-[4/5] w-full max-w-5xl overflow-visible rounded-xl border border-slate-200 bg-[linear-gradient(160deg,#eff6ff,#ecfeff)] shadow-inner sm:aspect-[16/10]">
      <svg
        aria-labelledby="coverage-map-graphic-title coverage-map-graphic-description"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 100"
      >
        <title id="coverage-map-graphic-title">Aggregate project coverage map</title>
        <desc id="coverage-map-graphic-description">
          A schematic map of the Philippines with approximate city-level points. Point to or focus a
          location for an overview, or select it for full details.
        </desc>
        <defs>
          <pattern height="10" id="map-grid" patternUnits="userSpaceOnUse" width="10">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#cbd5e1" strokeWidth="0.25" />
          </pattern>
        </defs>
        <rect fill="url(#map-grid)" height="100" width="100" />
        <g fill="#ffffff" stroke="#94a3b8" strokeLinejoin="round" strokeWidth="0.7">
          <path d="M39 7 48 5 55 11 57 20 53 28 57 35 50 42 43 38 39 30 34 25 36 15Z" />
          <path d="M45 44 50 43 52 49 48 53 44 50Z" />
          <path d="M20 49 25 45 27 53 24 61 20 68 16 74 13 72 16 62Z" />
          <path d="M55 52 61 51 63 57 58 60 54 57Z" />
          <path d="M61 57 65 54 67 63 64 71 61 67Z" />
          <path d="M69 56 72 54 73 68 70 72 68 65Z" />
          <path d="M77 49 82 47 84 58 81 66 77 62 75 55Z" />
          <path d="M76 65 82 63 84 72 80 78 76 74Z" />
          <path d="M69 70 75 69 77 74 72 77 68 75Z" />
          <path d="M61 79 69 75 79 77 88 83 91 91 84 95 74 92 67 96 58 91 55 85Z" />
        </g>
        <text fill="#64748b" fontSize="3" fontWeight="600" x="35" y="4">
          LUZON
        </text>
        <text fill="#64748b" fontSize="3" fontWeight="600" x="59" y="50">
          VISAYAS
        </text>
        <text fill="#64748b" fontSize="3" fontWeight="600" x="66" y="99">
          MINDANAO
        </text>
      </svg>

      {locations.map((location) => {
        const position =
          collisionAwareMarkerPositions[location.id] ??
          getMapPosition(location.latitude, location.longitude)
        const markerSize = getMarkerSize(location.beneficiariesReached)
        const active = activeLocationId === location.id
        const tooltipId = `coverage-point-${location.id}-tooltip`

        return (
          <button
            aria-describedby={tooltipId}
            aria-expanded={active}
            aria-haspopup="dialog"
            aria-label={`${location.name}: ${formatNumber(location.beneficiariesReached)} Beneficiaries reached, ${location.deliverySites} delivery sites, ${location.coverageStatus} coverage`}
            className={cn(
              'group absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-semibold transition-transform hover:z-20 hover:scale-110 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/90 motion-reduce:hover:scale-100',
              active && 'z-10 ring-4 ring-slate-950/20',
            )}
            key={location.id}
            onClick={() => onSelect(location.id)}
            style={{
              left: `${position.left}%`,
              top: `${position.top}%`,
            }}
            type="button"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex items-center justify-center rounded-full border-2 text-[10px] shadow-lg',
                markerToneClasses[location.coverageStatus],
              )}
              style={{ height: markerSize, width: markerSize }}
            >
              {location.projectIds.length}
            </span>
            <span
              className={cn(
                'pointer-events-none absolute bottom-full z-30 mb-2 hidden w-48 rounded-lg bg-slate-950 p-2.5 text-left text-white shadow-xl group-hover:block group-focus-visible:block',
                tooltipPlacement(position.left),
              )}
              id={tooltipId}
              role="tooltip"
            >
              <span className="block text-xs font-semibold">{location.name}</span>
              <span className="mt-0.5 block text-[10px] font-normal text-slate-300">
                {location.region}
              </span>
              <span className="mt-2 block text-[11px] font-medium">
                {formatNumber(location.beneficiariesReached)} Beneficiaries ·{' '}
                {location.deliverySites} site{location.deliverySites === 1 ? '' : 's'}
              </span>
              <span className="mt-0.5 block text-[10px] font-normal text-slate-300">
                {location.coverageStatus} coverage · {location.activitiesDelivered} activities
              </span>
            </span>
          </button>
        )
      })}
    </div>

    <div className="mx-auto mt-4 grid max-w-xs grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground sm:flex sm:max-w-none sm:flex-wrap sm:justify-center">
      {(['Strong', 'Growing', 'Limited', 'Planned'] as const).map((status) => (
        <span className="flex items-center gap-1.5" key={status}>
          <span
            className={cn('h-2.5 w-2.5 rounded-full', markerToneClasses[status].split(' ')[1])}
          />
          {status}
        </span>
      ))}
    </div>
    <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">
      Point size represents total Beneficiary reach. Point numbers show project count. Nearby city
      points are offset within their region so each remains selectable. Select a point for details.
    </p>
  </div>
)

const LocationDetailsDialog = ({
  location,
  period,
  projectTitles,
}: {
  location: AnalyticsLocationInsight
  period: string
  projectTitles: Map<string, string>
}) => (
  <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader>
      <div className="flex flex-wrap items-start justify-between gap-3 pr-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Location details
          </p>
          <DialogTitle className="mt-1 text-2xl">{location.name} location details</DialogTitle>
        </div>
        <StatusBadge tone={coverageTone(location.coverageStatus)}>
          {location.coverageStatus} coverage
        </StatusBadge>
      </div>
      <DialogDescription>
        {location.region} · {period} prototype summary
      </DialogDescription>
    </DialogHeader>

    <div className="grid gap-3 sm:grid-cols-3">
      <LocationMetric
        label="Beneficiaries reached"
        value={formatNumber(location.beneficiariesReached)}
      />
      <LocationMetric label="Delivery sites" value={location.deliverySites.toString()} />
      <LocationMetric
        label="Activities delivered"
        value={location.activitiesDelivered.toString()}
      />
    </div>

    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
      <h3 className="font-semibold text-foreground">Coverage overview</h3>
      <p className="text-sm leading-6 text-muted-foreground">{coverageSummary(location)}</p>
    </div>

    <div className="space-y-3">
      <h3 className="font-semibold text-foreground">Projects represented</h3>
      <div className="flex flex-wrap gap-2">
        {location.projectIds.map((projectId) => (
          <span
            className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
            key={projectId}
          >
            {projectTitles.get(projectId) ?? projectId}
          </span>
        ))}
      </div>
    </div>

    <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-xs leading-5 text-info">
      Approximate city-level location. This prototype shows summary information only and does not
      include addresses or Beneficiary-level locations.
    </div>
  </DialogContent>
)

const LocationMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold text-foreground">{value}</p>
  </div>
)
