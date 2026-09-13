import { describe, expect, it } from 'vitest'

import { projectSetupSchema } from './project-form-validation'

describe('project setup validation', () => {
  it('requires project setup fields', () => {
    const result = projectSetupSchema.safeParse({
      title: '',
      code: '',
      implementationArea: '',
      startDate: '',
      endDate: '',
      status: 'Planned',
      description: '',
      objectives: '',
    })

    expect(result.success).toBe(false)
  })

  it('rejects an end date before the start date', () => {
    const result = projectSetupSchema.safeParse({
      title: 'Community Resilience Project',
      code: 'CRP-2026',
      implementationArea: 'Navotas',
      startDate: '2026-12-01',
      endDate: '2026-08-01',
      status: 'Planned',
      description: 'Project setup validation record.',
      objectives: 'Provide a clear project objective.',
    })

    expect(result.success).toBe(false)
  })
})
