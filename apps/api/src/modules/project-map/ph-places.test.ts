import { describe, expect, it } from 'vitest'

import { resolvePlaces } from './ph-places'

const names = (area: string | null) => resolvePlaces(area).map((place) => place.name)

describe('resolvePlaces', () => {
  it('resolves every named municipality in a seeded implementation area', () => {
    expect(names('Borongan City, Guiuan and Llorente, Eastern Samar').sort()).toEqual([
      'Borongan',
      'Guiuan',
      'Llorente',
    ])
  })

  it('keeps a city that shares its name with its province without adding the province', () => {
    expect(names('Masbate City, Masbate')).toEqual(['Masbate City'])
    expect(names('Quezon City')).toEqual(['Quezon City'])
  })

  it('falls back to the province centroid when no city is named', () => {
    expect(names('Coastal barangays of Northern Samar')).toEqual(['Northern Samar'])
    expect(names('Eastern Samar')).toEqual(['Eastern Samar'])
  })

  it('needs the province to place a duplicated city name', () => {
    expect(names('San Fernando, Pampanga')).toEqual(['San Fernando'])
    expect(resolvePlaces('San Fernando, Pampanga')[0].province).toBe('Pampanga')
    expect(names('San Fernando')).toEqual([])
  })

  it('ignores accents, case and unknown text rather than guessing', () => {
    expect(names('las pinas')).toEqual(['Las Piñas'])
    expect(names('Synthetic area')).toEqual([])
    expect(names(null)).toEqual([])
  })
})
