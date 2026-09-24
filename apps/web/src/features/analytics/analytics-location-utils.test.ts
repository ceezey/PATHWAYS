import { describe, expect, it } from 'vitest'

import {
  EMPTY_SAFE_MAP_FEATURE_COLLECTION,
  toSafeMapFeatureCollection,
} from './analytics-location-utils'

describe('safe project map GeoJSON', () => {
  it('converts only allowlisted project-safe fields to Point features', () => {
    const result = toSafeMapFeatureCollection([
      {
        id: 'project-alpha',
        label: 'Project Alpha',
        latitude: 14.6,
        longitude: 121,
        beneficiaryName: 'must-not-leak',
      } as never,
    ])

    expect(result).toEqual({
      rejectedPointCount: 0,
      featureCollection: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'project-alpha',
            properties: { id: 'project-alpha', label: 'Project Alpha' },
            geometry: { type: 'Point', coordinates: [121, 14.6] },
          },
        ],
      },
    })
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
  })

  it.each([
    { id: 'north', latitude: 90.0001, longitude: 0 },
    { id: 'south', latitude: -90.0001, longitude: 0 },
    { id: 'east', latitude: 0, longitude: 180.0001 },
    { id: 'west', latitude: 0, longitude: -180.0001 },
    { id: 'nan', latitude: Number.NaN, longitude: 0 },
    { id: 'infinity', latitude: 0, longitude: Number.POSITIVE_INFINITY },
  ])('rejects an invalid or non-finite coordinate for $id', (point) => {
    expect(toSafeMapFeatureCollection([point])).toEqual({
      featureCollection: EMPTY_SAFE_MAP_FEATURE_COLLECTION,
      rejectedPointCount: 1,
    })
  })

  it('accepts inclusive world-coordinate boundaries', () => {
    const result = toSafeMapFeatureCollection([
      { id: 'south-west', latitude: -90, longitude: -180 },
      { id: 'north-east', latitude: 90, longitude: 180 },
    ])

    expect(result.rejectedPointCount).toBe(0)
    expect(result.featureCollection.features).toHaveLength(2)
  })
})
