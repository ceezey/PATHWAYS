import { describe, expect, it } from 'vitest'

import {
  EMPTY_SAFE_MAP_FEATURE_COLLECTION,
  toProjectCoverageFeatureCollection,
} from './analytics-location-utils'

describe('project coverage map data contract', () => {
  it.each([
    undefined,
    null,
    { id: 'project-a', title: 'Project A' },
    { id: 'project-b', title: 'Project B' },
  ])('returns an explicit empty FeatureCollection for the current Project scope', (project) => {
    expect(toProjectCoverageFeatureCollection(project)).toEqual(EMPTY_SAFE_MAP_FEATURE_COLLECTION)
  })

  it('does not derive coordinates or properties from text or beneficiary-like fields', () => {
    const result = toProjectCoverageFeatureCollection({
      id: 'project-a',
      title: 'Project A',
      implementationArea: 'Quezon City',
      beneficiaryName: 'must-not-leak',
      latitude: 14.676,
      longitude: 121.044,
    } as never)

    expect(result).toEqual({ type: 'FeatureCollection', features: [] })
    expect(JSON.stringify(result)).not.toContain('Quezon City')
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
    expect(JSON.stringify(result)).not.toContain('14.676')
  })

  it('returns a new collection when the selected Project scope is recomputed', () => {
    const first = toProjectCoverageFeatureCollection({ id: 'project-a', title: 'Project A' })
    const second = toProjectCoverageFeatureCollection({ id: 'project-b', title: 'Project B' })

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
  })
})
