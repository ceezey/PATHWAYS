import { describe, expect, it } from 'vitest'

import { resolvePlaces } from './ph-places'
import { placeReach, resolveTowns } from './project-map.service'

const [borongan, guiuan] = resolvePlaces('Borongan City and Guiuan, Eastern Samar')
const [easternSamar] = resolvePlaces('Eastern Samar')
if (!borongan || !guiuan || !easternSamar) throw new Error('Fixture places must resolve')
const sex = (male: number, female: number) => [
  { key: 'MALE', label: 'Male', n: male },
  { key: 'FEMALE', label: 'Female', n: female },
]
const boronganRows = [
  { town: 'Borongan City', province: 'Eastern Samar', total: 5, disability: 1, sex: sex(2, 3) },
  { town: 'Borongan', province: null, total: 1, disability: 1, sex: sex(1, 0) },
]
const guiuanRow = {
  town: 'Guiuan',
  province: 'Eastern Samar',
  total: 3,
  disability: 0,
  sex: sex(0, 3),
}
const unknownRows = [
  { town: 'Nowhere', province: null, total: 4, disability: 2, sex: sex(4, 0) },
  { town: null, province: null, total: 2, disability: 1, sex: sex(1, 1) },
]
const missing = { state: 'MISSING', value: null, reason: 'NO_RESIDENCE_MATCH' }

describe('placeReach', () => {
  it('sums every town that resolves to the pin, with exact sex and disability counts', () => {
    const towns = resolveTowns([...boronganRows, guiuanRow, ...unknownRows])
    expect(placeReach(borongan, towns)).toEqual({
      total: { state: 'AVAILABLE', value: '6', reason: null },
      sex: [
        { key: 'MALE', label: 'Male', metric: { state: 'AVAILABLE', value: '3', reason: null } },
        {
          key: 'FEMALE',
          label: 'Female',
          metric: { state: 'AVAILABLE', value: '3', reason: null },
        },
      ],
      disability: { state: 'AVAILABLE', value: '2', reason: null },
    })
  })

  it('keeps each pin to its own town and shows a zero as ZERO', () => {
    const reach = placeReach(guiuan, resolveTowns([...boronganRows, guiuanRow]))
    expect(reach?.total.value).toBe('3')
    expect(reach?.sex[0]?.metric.state).toBe('ZERO')
    expect(reach?.disability.state).toBe('ZERO')
  })

  it('is a measured zero when every recorded town resolves elsewhere', () => {
    expect(placeReach(guiuan, resolveTowns(boronganRows))).toEqual({
      total: { state: 'ZERO', value: '0', reason: null },
      sex: [],
      disability: { state: 'ZERO', value: '0', reason: null },
    })
  })

  it('is missing, not zero, when a recorded town could belong to the pin', () => {
    const empty = { total: missing, sex: [], disability: missing }
    expect(placeReach(guiuan, resolveTowns([...boronganRows, ...unknownRows]))).toEqual(empty)
    const provinceOnly = { ...guiuanRow, town: 'Nowhere' }
    expect(placeReach(guiuan, resolveTowns([...boronganRows, provinceOnly]))).toEqual(empty)
  })

  it('counts every town of the province on a province pin', () => {
    const reach = placeReach(
      easternSamar,
      resolveTowns([...boronganRows, guiuanRow, ...unknownRows]),
    )
    expect(reach?.total.value).toBe('9')
    expect(reach?.disability.value).toBe('2')
  })
})
