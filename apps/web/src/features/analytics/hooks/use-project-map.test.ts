import type { ProjectMap } from '@pathways/shared'
import { describe, expect, it, vi } from 'vitest'

import { toProjectMapFeatures } from './use-project-map'

vi.mock('@/lib/api/projects', () => ({ projectsClient: {} }))

const place = (saved: boolean, longitude = 121, latitude = 14.6, locked = false) =>
  ({ name: 'Town', province: 'Province', longitude, latitude, saved, locked, reach: null }) as const

const mapOf = (...places: ReturnType<typeof place>[][]) =>
  ({
    projects: places.map((list, index) => ({
      id: `project-${index}`,
      title: `P${index}`,
      places: list,
    })),
  }) as unknown as ProjectMap

describe('toProjectMapFeatures', () => {
  it('keeps a saved pin at its exact coordinates and the unsaved one at the centroid', () => {
    const { features } = toProjectMapFeatures(mapOf([place(false)], [place(true)]))

    expect(features[0]?.geometry.coordinates).toEqual([121, 14.6])
    expect(features[1]?.geometry.coordinates).toEqual([121, 14.6])
  })

  it('rings only unsaved pins that share a centroid, saved pins take no ring slot', () => {
    const { features } = toProjectMapFeatures(
      mapOf([place(true, 121, 14.6)], [place(false)], [place(false)]),
    )

    expect(features[0]?.geometry.coordinates).toEqual([121, 14.6])
    expect(features[1]?.geometry.coordinates).toEqual([121, 14.6])
    expect(features[2]?.geometry.coordinates).not.toEqual([121, 14.6])
  })

  it('keeps the ring slot of a locked pin that was never moved', () => {
    const { features } = toProjectMapFeatures(
      mapOf([place(false, 121, 14.6, true)], [place(false)]),
    )

    expect(features[0]?.geometry.coordinates).toEqual([121, 14.6])
    expect(features[1]?.geometry.coordinates).not.toEqual([121, 14.6])
    expect(features[0]?.properties.locked).toBe(true)
  })

  it('copies locked into the feature properties', () => {
    const { features } = toProjectMapFeatures(mapOf([place(true, 121, 14.6, true)], [place(false)]))

    expect(features.map((feature) => feature.properties.locked)).toEqual([true, false])
  })
})
