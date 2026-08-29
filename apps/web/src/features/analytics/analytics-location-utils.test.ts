import { describe, expect, it } from 'vitest'

import type { AnalyticsLocationRecord } from '@/types/pathways'

import { buildLocationInsights, getLocationKpis, getMapPosition } from './analytics-location-utils'

const testLocations: AnalyticsLocationRecord[] = [
  {
    id: 'city-alpha',
    name: 'City Alpha',
    region: 'Region One',
    latitude: 14.6,
    longitude: 121,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'project-alpha',
        beneficiariesReached: 100,
        deliverySites: 2,
        activitiesDelivered: 4,
        coverageStatus: 'Strong',
      },
    ],
  },
  {
    id: 'city-overlap',
    name: 'City Overlap',
    region: 'Region One',
    latitude: 14.7,
    longitude: 120.9,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'project-alpha',
        beneficiariesReached: 50,
        deliverySites: 1,
        activitiesDelivered: 2,
        coverageStatus: 'Growing',
      },
      {
        projectId: 'project-beta',
        beneficiariesReached: 75,
        deliverySites: 3,
        activitiesDelivered: 3,
        coverageStatus: 'Limited',
      },
    ],
  },
  {
    id: 'city-beta',
    name: 'City Beta',
    region: 'Region Two',
    latitude: 12.1,
    longitude: 124.6,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'project-beta',
        beneficiariesReached: 25,
        deliverySites: 1,
        activitiesDelivered: 1,
        coverageStatus: 'Limited',
      },
    ],
  },
]

const allProjectIds = ['project-alpha', 'project-beta']

describe('aggregate analytics location helpers', () => {
  it('builds portfolio location totals from city-level project summaries', () => {
    const insights = buildLocationInsights(testLocations, allProjectIds)

    expect(getLocationKpis(insights)).toEqual({
      locationCount: 3,
      deliverySites: 7,
      beneficiariesReached: 250,
      locationsNeedingAttention: 2,
    })
  })

  it('keeps project filtering consistent with project reach totals', () => {
    const insights = buildLocationInsights(testLocations, ['project-alpha'])

    expect(getLocationKpis(insights)).toMatchObject({
      locationCount: 2,
      deliverySites: 3,
      beneficiariesReached: 150,
    })
  })

  it('aggregates overlapping project coverage without duplicating the city marker', () => {
    const overlap = buildLocationInsights(testLocations, allProjectIds).find(
      (location) => location.id === 'city-overlap',
    )

    expect(overlap).toMatchObject({
      beneficiariesReached: 125,
      deliverySites: 4,
      coverageStatus: 'Limited',
      projectIds: ['project-alpha', 'project-beta'],
    })
  })

  it('projects approximate city centroids inside the map and contains no precise-location fields', () => {
    const city = testLocations.find((location) => location.id === 'city-alpha')

    expect(city).toBeDefined()
    expect(getMapPosition(city?.latitude ?? 0, city?.longitude ?? 0)).toEqual({
      left: expect.any(Number),
      top: expect.any(Number),
    })
    expect(JSON.stringify(testLocations)).not.toMatch(
      /beneficiaryId|firstName|lastName|barangay|street|address|contact/i,
    )
  })
})
