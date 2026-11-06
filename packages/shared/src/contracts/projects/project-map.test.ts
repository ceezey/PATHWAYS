import { describe, expect, it } from 'vitest'
import { PROJECT_MAP_CONTRACT_VERSION, projectMapSchema } from './project-map'

const place = {
  name: 'Sample City',
  province: 'Sample Province',
  longitude: 121,
  latitude: 14,
  reach: null,
}
const bucket = { key: 'F', label: 'Female', metric: { state: 'ZERO', value: '0', reason: null } }
const project = {
  id: '77000000-0000-4000-8000-000000000001',
  code: 'PRJ-1',
  title: 'Sample project',
  status: 'ACTIVE',
  implementationArea: 'Sample area',
  places: [place],
  overview: null,
  sadddSex: [bucket],
  sadddDisability: null,
}
const valid = {
  contractVersion: PROJECT_MAP_CONTRACT_VERSION,
  generatedAt: '2026-06-01T00:00:00Z',
  projects: [project],
  unmappedCount: 0,
}
const withProject = (patch: object) => ({ ...valid, projects: [{ ...project, ...patch }] })

describe('projectMapSchema', () => {
  it('accepts a map with one project', () => {
    expect(projectMapSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a place with released reach', () => {
    const count = { state: 'AVAILABLE', value: '3', reason: null }
    const reach = { total: count, sex: [{ ...bucket, metric: count }], disability: bucket.metric }
    expect(projectMapSchema.safeParse(withProject({ places: [{ ...place, reach }] })).success).toBe(
      true,
    )
  })

  it('accepts a place whose recorded towns could not be matched', () => {
    const missing = { state: 'MISSING', value: null, reason: 'NO_RESIDENCE_MATCH' }
    const reach = { total: missing, sex: [], disability: missing }
    expect(projectMapSchema.safeParse(withProject({ places: [{ ...place, reach }] })).success).toBe(
      true,
    )
  })

  it('rejects an unknown key on the map', () => {
    expect(projectMapSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })

  it('rejects an unknown key on a project', () => {
    expect(projectMapSchema.safeParse(withProject({ beneficiaryRows: [] })).success).toBe(false)
  })

  it('rejects an unknown key on a place', () => {
    expect(
      projectMapSchema.safeParse(withProject({ places: [{ ...place, extra: 1 }] })).success,
    ).toBe(false)
  })

  it('rejects an unknown key on a sex bucket', () => {
    expect(
      projectMapSchema.safeParse(withProject({ sadddSex: [{ ...bucket, extra: 1 }] })).success,
    ).toBe(false)
  })
})
