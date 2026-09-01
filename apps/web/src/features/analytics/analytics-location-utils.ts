import type {
  AnalyticsCoverageStatus,
  AnalyticsLocationProjectSummary,
  AnalyticsLocationRecord,
} from '@/types/pathways'

export interface AnalyticsLocationInsight {
  id: string
  name: string
  region: string
  latitude: number
  longitude: number
  coordinatePrecision: AnalyticsLocationRecord['coordinatePrecision']
  projectIds: string[]
  beneficiariesReached: number
  deliverySites: number
  activitiesDelivered: number
  coverageStatus: AnalyticsCoverageStatus
}

const statusPriority: Record<AnalyticsCoverageStatus, number> = {
  Planned: 0,
  Strong: 1,
  Growing: 2,
  Limited: 3,
}

const aggregateStatus = (summaries: AnalyticsLocationProjectSummary[]) =>
  summaries.reduce<AnalyticsCoverageStatus>(
    (current, summary) =>
      statusPriority[summary.coverageStatus] > statusPriority[current]
        ? summary.coverageStatus
        : current,
    'Planned',
  )

export const buildLocationInsights = (
  locations: AnalyticsLocationRecord[],
  visibleProjectIds: string[],
) =>
  locations.reduce<AnalyticsLocationInsight[]>((insights, location) => {
    const projectSummaries = location.projectSummaries.filter((summary) =>
      visibleProjectIds.includes(summary.projectId),
    )

    if (projectSummaries.length === 0) {
      return insights
    }

    insights.push({
      id: location.id,
      name: location.name,
      region: location.region,
      latitude: location.latitude,
      longitude: location.longitude,
      coordinatePrecision: location.coordinatePrecision,
      projectIds: projectSummaries.map((summary) => summary.projectId),
      beneficiariesReached: projectSummaries.reduce(
        (total, summary) => total + summary.beneficiariesReached,
        0,
      ),
      deliverySites: projectSummaries.reduce((total, summary) => total + summary.deliverySites, 0),
      activitiesDelivered: projectSummaries.reduce(
        (total, summary) => total + summary.activitiesDelivered,
        0,
      ),
      coverageStatus: aggregateStatus(projectSummaries),
    })

    return insights
  }, [])

export const getLocationKpis = (locations: AnalyticsLocationInsight[]) => ({
  locationCount: locations.length,
  deliverySites: locations.reduce((total, location) => total + location.deliverySites, 0),
  beneficiariesReached: locations.reduce(
    (total, location) => total + location.beneficiariesReached,
    0,
  ),
  locationsNeedingAttention: locations.filter((location) => location.coverageStatus === 'Limited')
    .length,
})

const mapBounds = {
  minLongitude: 116,
  maxLongitude: 127,
  minLatitude: 5,
  maxLatitude: 20,
}

export const getMapPosition = (latitude: number, longitude: number) => {
  const left =
    ((longitude - mapBounds.minLongitude) / (mapBounds.maxLongitude - mapBounds.minLongitude)) * 100
  const top =
    ((mapBounds.maxLatitude - latitude) / (mapBounds.maxLatitude - mapBounds.minLatitude)) * 100

  return {
    left: Math.min(96, Math.max(4, left)),
    top: Math.min(96, Math.max(4, top)),
  }
}

export const getMarkerSize = (beneficiariesReached: number) =>
  Math.min(34, Math.max(18, 18 + Math.sqrt(beneficiariesReached) * 0.55))
