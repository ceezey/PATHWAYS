import { describe, expect, it } from 'vitest'

import { projectSetupSchema } from './project-form-validation'

describe('project setup validation', () => {
  it('requires project setup fields', () => {
    const result = projectSetupSchema.safeParse({
      title: '',
      sector: '',
      area: '',
      startDate: '',
      endDate: '',
      status: 'Planned',
      budgetCode: '',
      description: '',
      programManager: '',
      projectManager: '',
      monitoringOfficer: '',
      projectOfficers: '',
    })

    expect(result.success).toBe(false)
  })

  it('rejects an end date before the start date', () => {
    const result = projectSetupSchema.safeParse({
      title: 'Prototype Project',
      sector: 'Education',
      area: 'Navotas',
      startDate: '2026-12-01',
      endDate: '2026-08-01',
      status: 'Planned',
      budgetCode: 'PP-2026',
      description: 'Prototype setup validation project.',
      programManager: 'Program Manager A',
      projectManager: 'Project Manager A',
      monitoringOfficer: 'Monitoring and Evaluation Officer A',
      projectOfficers: 'Project Officer A',
    })

    expect(result.success).toBe(false)
  })
})
