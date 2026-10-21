import { describe, expect, it } from 'vitest'
import { PROJECT_MAP_CONTRACT_VERSION, projectMapSchema } from './project-map'

const place = { name: 'Sample City', province: 'Sample Province', longitude: 121, latitude: 14, reach: null }
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
