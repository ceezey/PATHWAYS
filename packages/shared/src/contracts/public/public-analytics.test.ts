import { describe, expect, it } from 'vitest'

import { publicAnalyticsResponse, publicMapResponse, publicSadddResponse } from './public-analytics'

const cell = { state: 'AVAILABLE', value: '5', reason: null }
const bucket = { key: 'MALE', label: 'Male', metric: cell }
const place = {
  name: 'Cebu City',
  province: 'Cebu',
  longitude: 123.9,
  latitude: 10.3,
  saved: false,
  locked: false,
  reach: { total: cell, sex: [bucket], disability: cell },
}

describe('public analytics contracts', () => {
  it('accepts each view by its tag', () => {
    const sadddBody = { total: cell, sex: [bucket], age: [], disability: [] }
    for (const body of [
      { view: 'kpi', indicators: [] },
      { view: 'saddd', ...sadddBody },
      { view: 'map', places: [place] },
    ])
      expect(publicAnalyticsResponse.safeParse(body).success).toBe(true)
  })

  it.each([
    { view: 'budget', places: [] },
    { view: 'kpi', indicators: [], budget: 1 },
    { view: 'map', places: [place], overview: 'x' },
  ])('rejects the body %j', (body) => {
    expect(publicAnalyticsResponse.safeParse(body).success).toBe(false)
  })

  it('limits the map to 20 places and saddd to its bucket counts', () => {
    expect(publicMapResponse.safeParse({ places: Array(21).fill(place) }).success).toBe(false)
    const six = Array(6).fill(bucket)
    expect(
      publicSadddResponse.safeParse({ total: cell, sex: six, age: [], disability: [] }).success,
    ).toBe(false)
  })
})
