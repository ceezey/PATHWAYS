import { describe, expect, it } from 'vitest'

import { mockAnalyticsLocations } from '@/mocks/pathways'

import { buildLocationInsights, getLocationKpis, getMapPosition } from './analytics-location-utils'

const allProjectIds = [
  'futuremakers-ncr',
  'youth-rise-western-samar',
  'grassroots-centers-navotas',
  'girls-lead-metro-manila',
  'safe-spaces-northern-samar',
]

describe('aggregate analytics location helpers', () => {
  it('builds portfolio location totals from city-level project summaries', () => {
    const insights = buildLocationInsights(mockAnalyticsLocations, allProjectIds)

    expect(getLocationKpis(insights)).toEqual({
      locationCount: 9,
      deliverySites: 23,
      beneficiariesReached: 2033,
      locationsNeedingAttention: 4,
    })
  })

  it('keeps project filtering consistent with project reach totals', () => {
    const insights = buildLocationInsights(mockAnalyticsLocations, ['futuremakers-ncr'])

    expect(getLocationKpis(insights)).toMatchObject({
      locationCount: 3,
      deliverySites: 9,
      beneficiariesReached: 842,
    })
  })

  it('aggregates overlapping project coverage without duplicating the city marker', () => {
    const navotas = buildLocationInsights(mockAnalyticsLocations, allProjectIds).find(
      (location) => location.id === 'navotas',
    )

    expect(navotas).toMatchObject({
      beneficiariesReached: 698,
      deliverySites: 7,
      coverageStatus: 'Growing',
      projectIds: ['futuremakers-ncr', 'grassroots-centers-navotas'],
    })
  })

  it('projects approximate city centroids inside the map and contains no precise-location fields', () => {
    const manila = mockAnalyticsLocations.find((location) => location.id === 'manila')

    expect(manila).toBeDefined()
    expect(getMapPosition(manila?.latitude ?? 0, manila?.longitude ?? 0)).toEqual({
      left: expect.any(Number),
      top: expect.any(Number),
    })
    expect(JSON.stringify(mockAnalyticsLocations)).not.toMatch(
      /beneficiaryId|firstName|lastName|barangay|street|address|contact/i,
    )
  })
})
