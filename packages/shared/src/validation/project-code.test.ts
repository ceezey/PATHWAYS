import { describe, expect, it } from 'vitest'

import { projectCodeBase, uniqueProjectCode } from './project-code'

describe('project codes', () => {
  it('matches the seeded code style', () => {
    expect(
      projectCodeBase({
        title: 'Community Resilience and Livelihoods - Northern Samar',
        area: 'Catarman and Lavezares, Northern Samar',
        startDate: '2026-02-01',
      }),
    ).toBe('CRL-NS-2026')
    expect(
      projectCodeBase({
        title: 'School Girls Education Continuity Initiative - Eastern Samar',
        area: 'Borongan City and Guiuan, Eastern Samar',
        startDate: '2026-03-01',
      }),
    ).toBe('SGE-ES-2026')
  })

  it('handles single words and a missing area', () => {
    expect(projectCodeBase({ title: 'Test-Project', area: 'Pasig', startDate: '2026-01-01' })).toBe(
      'TP-PA-2026',
    )
    expect(projectCodeBase({ title: 'Nutrition', startDate: '2027-05-01' })).toBe('NU-2027')
  })

  it('adds a numeric suffix when the code is taken', () => {
    expect(uniqueProjectCode('TP-PA-2026', [])).toBe('TP-PA-2026')
    expect(uniqueProjectCode('TP-PA-2026', ['tp-pa-2026', 'TP-PA-2026-2'])).toBe('TP-PA-2026-3')
  })
})
