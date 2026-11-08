import { describe, expect, it } from 'vitest'
import { mapPinPlaceQuery, saveMapPinRequest } from './project-map-pins'

const valid = {
  name: 'Guiuan',
  province: 'Eastern Samar',
  longitude: 125.72,
  latitude: 11.03,
  locked: true,
}

describe('saveMapPinRequest', () => {
  it('accepts a pin inside the map area', () => {
    expect(saveMapPinRequest.safeParse(valid).success).toBe(true)
  })

  it('trims the place name and province', () => {
    const parsed = saveMapPinRequest.parse({
      ...valid,
      name: ' Guiuan ',
      province: ' Eastern Samar ',
    })
    expect(parsed).toMatchObject({ name: 'Guiuan', province: 'Eastern Samar' })
  })

  it.each([
    ['longitude past the east edge', { longitude: 128.01 }],
    ['longitude past the west edge', { longitude: 113.99 }],
    ['latitude past the south edge', { latitude: 3.99 }],
    ['latitude past the north edge', { latitude: 22.01 }],
    ['an empty name', { name: '' }],
    ['a blank province', { province: '   ' }],
    ['a missing locked flag', { locked: undefined }],
    ['an extra key', { extra: 1 }],
  ])('rejects %s', (_label, patch) => {
    expect(saveMapPinRequest.safeParse({ ...valid, ...patch }).success).toBe(false)
  })
})

describe('mapPinPlaceQuery', () => {
  it('accepts a name and province and rejects an extra key', () => {
    expect(mapPinPlaceQuery.safeParse({ name: 'Guiuan', province: 'Eastern Samar' }).success).toBe(
      true,
    )
    expect(
      mapPinPlaceQuery.safeParse({ name: 'Guiuan', province: 'Eastern Samar', extra: 1 }).success,
    ).toBe(false)
  })
})
