import { describe, expect, it } from 'vitest'

import { resolvePlaces } from './ph-places'
import { placeReach } from './project-map.service'

const [borongan, guiuan] = resolvePlaces('Borongan City and Guiuan, Eastern Samar')
const sex = (male: number, female: number) => [
  { key: 'MALE', label: 'Male', n: male },
  { key: 'FEMALE', label: 'Female', n: female },
]
const towns = [
  { town: 'Borongan City', province: 'Eastern Samar', total: 5, sex: sex(2, 3) },
  { town: 'Borongan', province: null, total: 1, sex: sex(1, 0) },
  { town: 'Guiuan', province: 'Eastern Samar', total: 3, sex: sex(0, 3) },
  { town: 'Nowhere', province: null, total: 4, sex: sex(4, 0) },
  { town: null, province: null, total: 2, sex: sex(1, 1) },
]

describe('placeReach', () => {
  it('sums every town that resolves to the pin, with exact sex counts', () => {
    expect(placeReach(borongan!, towns)).toEqual({
      total: { state: 'AVAILABLE', value: '6', reason: null },
      sex: [
        { key: 'MALE', label: 'Male', metric: { state: 'AVAILABLE', value: '3', reason: null } },
        {
          key: 'FEMALE',
          label: 'Female',
          metric: { state: 'AVAILABLE', value: '3', reason: null },
        },
      ],
    })
  })

  it('keeps each pin to its own town and shows a zero as ZERO', () => {
    const reach = placeReach(guiuan!, towns)
    expect(reach?.total.value).toBe('3')
    expect(reach?.sex[0]?.metric.state).toBe('ZERO')
  })

  it('gives a pin no reach when no recorded town resolves to it', () => {
    expect(placeReach(guiuan!, towns.slice(3))).toEqual({
      total: { state: 'ZERO', value: '0', reason: null },
      sex: [],
    })
  })
})
