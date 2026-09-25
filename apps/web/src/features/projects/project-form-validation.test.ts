import { describe, expect, it } from 'vitest'

import {
  projectSetupSchema,
  toCreateProjectInput,
  toProjectTeamInput,
  toUpdateProjectInput,
} from './project-form-validation'

const validValues = {
  objectives: 'Develop youth skills',
  partners: '',
  projectBudget: '',
  targetBeneficiaries: '',
  targetGoal: '75',
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
      targetGoal: '',
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

  it('accepts only an exact target percentage greater than zero through 100', () => {
    expect(projectSetupSchema.safeParse({ ...validValues, targetGoal: '62.5000' }).success).toBe(
      true,
    )
    for (const targetGoal of ['0', '-1', '100.0001', '50.00001', '1e2']) {
      expect(projectSetupSchema.safeParse({ ...validValues, targetGoal }).success).toBe(false)
    }
  })

  it('rejects an end date before the start date', () => {
    const result = projectSetupSchema.safeParse({
      ...validValues,
      startDate: '2026-12-01',
      endDate: '2026-08-01',
    })

    expect(result.success).toBe(false)
  })

  it('rejects out-of-range targets and malformed project budgets', () => {
    for (const targetBeneficiaries of ['-1', '1.5', '2147483648']) {
      expect(projectSetupSchema.safeParse({ ...validValues, targetBeneficiaries }).success).toBe(
        false,
      )
    }
    for (const projectBudget of ['-1', '1.234', '1e3']) {
      expect(projectSetupSchema.safeParse({ ...validValues, projectBudget }).success).toBe(false)
    }
  })

  it('adapts all implemented profile fields and keeps team IDs explicit', () => {
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
      implementingPartners: 'Fictional Partner',
      projectBudget: '100000',
      targetBeneficiaries: 450,
      sector: 'Education',
      status: 'Planned',
    })
    expect(input).not.toHaveProperty('partners')
    expect(input).not.toHaveProperty('projectManager')
    expect(
      toProjectTeamInput(
        {
          ...validValues,
          programManager: 'Program Manager A',
          projectManager: 'Project Manager A',
          monitoringOfficer: 'Monitoring Officer A',
          projectOfficers: 'Project Officer A',
        },
        [
          {
            id: 'pm-program',
            name: 'Program Manager A',
            email: 'program@example.test',
            role: 'Program Manager',
            accountStatus: 'Active',
            projectIds: [],
            projectAccess: [],
            signInMethod: 'Supabase account',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
          {
            id: 'pm-project',
            name: 'Project Manager A',
            email: 'manager@example.test',
            role: 'Project Manager',
            accountStatus: 'Active',
            projectIds: [],
            projectAccess: [],
            signInMethod: 'Supabase account',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
          {
            id: 'me',
            name: 'Monitoring Officer A',
            email: 'me@example.test',
            role: 'Monitoring and Evaluation Officer',
            accountStatus: 'Active',
            projectIds: [],
            projectAccess: [],
            signInMethod: 'Supabase account',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
          {
            id: 'po',
            name: 'Project Officer A',
            email: 'po@example.test',
            role: 'Project Officer',
            accountStatus: 'Active',
            projectIds: [],
            projectAccess: [],
            signInMethod: 'Supabase account',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
      ),
    ).toEqual({
      programManagerId: 'pm-program',
      projectManagerId: 'pm-project',
      monitoringOfficerId: 'me',
      projectOfficerIds: ['po'],
    })
  })

  it('preserves the stored code, program, revision and cancelled state on edit', () => {
    const input = toUpdateProjectInput(
      { ...validValues, status: 'Needs Attention', targetGoal: '' },
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
        targetGoal: null,
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
    expect(input).not.toHaveProperty('targetGoal')
  })
})
