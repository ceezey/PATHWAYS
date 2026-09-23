import { describe, expect, it } from 'vitest'

import {
  projectSetupSchema,
  toCreateProjectInput,
  toUpdateProjectInput,
} from './project-form-validation'

const validValues = {
  objectives: 'Develop youth skills',
  partners: '',
  projectBudget: '',
  targetBeneficiaries: '',
  title: 'Community project',
  sector: '',
  area: 'Navotas',
  startDate: '2026-08-01',
  endDate: '2026-12-01',
  status: 'Planned' as const,
  description: 'Community project delivery profile.',
  programManager: '',
  projectManager: '',
  monitoringOfficer: '',
  projectOfficers: '',
}

describe('project setup validation', () => {
  it('requires project setup fields', () => {
    const result = projectSetupSchema.safeParse({
      objectives: '',
      partners: '',
      projectBudget: '',
      targetBeneficiaries: '',
      title: '',
      sector: '',
      area: '',
      startDate: '',
      endDate: '',
      status: 'Planned',
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
      ...validValues,
      startDate: '2026-12-01',
      endDate: '2026-08-01',
    })

    expect(result.success).toBe(false)
  })

  it('adapts only supported core fields and omits deferred profile and team values', () => {
    const input = toCreateProjectInput({
      ...validValues,
      partners: 'Fictional Partner',
      projectBudget: '100000',
      targetBeneficiaries: '450',
      sector: 'Education',
      programManager: 'Program Manager A',
      projectManager: 'Project Manager A',
      monitoringOfficer: 'Monitoring and Evaluation Officer A',
      projectOfficers: 'Project Officer A, Project Officer B',
    })

    expect(input).toMatchObject({
      title: validValues.title,
      objectives: validValues.objectives,
      implementationArea: validValues.area,
      status: 'Planned',
    })
    expect(input).not.toHaveProperty('partners')
    expect(input).not.toHaveProperty('projectBudget')
    expect(input).not.toHaveProperty('targetBeneficiaries')
    expect(input).not.toHaveProperty('sector')
    expect(input).not.toHaveProperty('projectManager')
  })

  it('preserves the stored code, program, revision and cancelled state on edit', () => {
    const input = toUpdateProjectInput(
      { ...validValues, status: 'Needs Attention' },
      {
        id: 'project-id',
        code: 'PRJ-EXISTING',
        title: 'Existing project',
        description: 'Existing description',
        objectives: 'Existing objectives',
        area: 'Navotas',
        sector: 'Sector not recorded',
        status: 'Needs Attention',
        storedStatus: 'CANCELLED',
        health: 'At Risk',
        period: '2026-08-01 - 2026-12-01',
        projectManager: 'Manager',
        kpiAchievement: 0,
        beneficiariesReached: 0,
        budgetUtilization: 0,
        timelineProgress: 0,
        programManager: 'Not assigned',
        monitoringOfficer: 'Not assigned',
        projectOfficers: [],
        targetBeneficiaries: 0,
        budgetCode: 'Not recorded',
        updatedAt: '2026-09-23T00:00:00.000Z',
        programId: '70000000-0000-4000-8000-000000000007',
      },
    )

    expect(input).toMatchObject({
      code: 'PRJ-EXISTING',
      programId: '70000000-0000-4000-8000-000000000007',
      status: 'CANCELLED',
      expectedUpdatedAt: '2026-09-23T00:00:00.000Z',
    })
  })
})
