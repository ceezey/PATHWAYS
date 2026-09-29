import { describe, expect, it } from 'vitest'

import {
  projectSetupSchema,
  projectTeamEditSchema,
  toCreateProjectInput,
  toProjectTeamInput,
  toUpdateProjectInput,
} from './project-form-validation'

const validValues = {
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

  it('accepts goal-free setup and never forwards a retired key from an old object', () => {
    const values = projectSetupSchema.parse({ ...validValues, targetGoal: '75' })
    expect(values).not.toHaveProperty('targetGoal')
    expect(toCreateProjectInput(values)).not.toHaveProperty('targetGoal')
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
      partnerOrganizations: 'Fictional Partner',
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
      implementationArea: validValues.area,
      implementingPartnerNames: ['Fictional Partner'],
      projectBudget: '100000',
      targetBeneficiaries: 450,
      sector: 'Education',
      status: 'Planned',
    })
    expect(input).not.toHaveProperty('partners')
    // The deprecated free-text column is never sent (migration 0039).
    expect(input).not.toHaveProperty('implementingPartners')
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
      objectives: 'Existing objectives',
    })
    expect(input).not.toHaveProperty('targetGoal')
  })

  it('carries the stored objectives into the update payload (the setup/team forms have no objectives field)', () => {
    const input = toUpdateProjectInput(validValues, {
      id: 'project-id',
      code: 'PRJ-EXISTING',
      title: 'Existing project',
      description: 'Existing description',
      objectives: 'Reduce dropout rates in target barangays',
      area: 'Navotas',
      sector: 'Sector not recorded',
      status: 'Planned',
      storedStatus: 'PLANNED',
      health: 'On Track',
      period: '2026-08-01 - 2026-12-01',
      projectManager: 'Not assigned',
      programManager: 'Not assigned',
      monitoringOfficer: 'Not assigned',
      projectOfficers: [],
      targetBeneficiaries: 0,

      budgetCode: 'Not recorded',
      updatedAt: '2026-09-23T00:00:00.000Z',
      programId: undefined,
    })

    expect(input.objectives).toBe('Reduce dropout rates in target barangays')

    // toCreateProjectInput and the setup form's own schema must stay untouched.
    const created = toCreateProjectInput(validValues)
    expect(created).not.toHaveProperty('objectives')
  })

  it('accepts the team-only edit schema without dates, sector, or area', () => {
    const result = projectTeamEditSchema.safeParse({
      ...validValues,
      sector: '',
      area: '',
      startDate: '',
      endDate: '',
    })

    expect(result.success).toBe(true)
  })

  it('omits blank start/end dates from the update payload instead of sending empty strings', () => {
    const input = toUpdateProjectInput(
      { ...validValues, startDate: '', endDate: '' },
      {
        id: 'project-id',
        code: 'PRJ-EXISTING',
        title: 'Existing project',
        description: 'Existing description',
        objectives: 'Existing objectives',
        area: 'Navotas',
        sector: 'Sector not recorded',
        status: 'Planned',
        storedStatus: 'PLANNED',
        health: 'On Track',
        period: 'Dates not recorded',
        projectManager: 'Not assigned',
        programManager: 'Not assigned',
        monitoringOfficer: 'Not assigned',
        projectOfficers: [],
        targetBeneficiaries: 0,

        budgetCode: 'Not recorded',
        updatedAt: '2026-09-23T00:00:00.000Z',
        programId: undefined,
      },
    )

    expect(input.startDate).toBeUndefined()
    expect(input.endDate).toBeUndefined()
    expect(input).not.toHaveProperty('startDate', '')
    expect(input).not.toHaveProperty('endDate', '')
  })

  it('sends an explicit null to clear an optional team role that was set to None', () => {
    expect(
      toProjectTeamInput(
        {
          ...validValues,
          programManager: '',
          projectManager: '',
          monitoringOfficer: '',
          projectOfficers: '',
        },
        [],
        { clearBlank: true },
      ),
    ).toEqual({
      programManagerId: null,
      projectManagerId: null,
      monitoringOfficerId: null,
    })
  })

  it('omits blank roles on project creation so server defaults such as creator assignment apply', () => {
    expect(
      toProjectTeamInput(
        {
          ...validValues,
          programManager: '',
          projectManager: '',
          monitoringOfficer: '',
          projectOfficers: '',
        },
        [],
      ),
    ).toEqual({})
  })

  it('leaves a role untouched when its selected name cannot be resolved defensively', () => {
    // validateProjectTeamSelections rejects this before submission in the UI;
    // toProjectTeamInput must still fail closed and never clear or corrupt an
    // assignment it could not resolve.
    expect(
      toProjectTeamInput({ ...validValues, programManager: 'Someone Unlisted' }, []),
    ).not.toHaveProperty('programManagerId')
  })

  it('with dirtyFields, only nulls a blank role the actor actually touched (chose None on)', () => {
    // Regression: the team editor combines clearBlank:true with react-hook-form's
    // dirtyFields so an assignment that reads back blank only because the
    // eligible-user directory has not resolved it yet (not because the actor
    // chose None) is never submitted as an explicit clear.
    const blankValues = {
      ...validValues,
      programManager: '',
      projectManager: '',
      monitoringOfficer: '',
    }

    expect(
      toProjectTeamInput(blankValues, [], {
        clearBlank: true,
        dirtyFields: { monitoringOfficer: true },
      }),
    ).toEqual({ monitoringOfficerId: null })

    expect(
      toProjectTeamInput(blankValues, [], {
        clearBlank: true,
        dirtyFields: { programManager: true, projectManager: true, monitoringOfficer: true },
      }),
    ).toEqual({
      programManagerId: null,
      projectManagerId: null,
      monitoringOfficerId: null,
    })

    expect(
      toProjectTeamInput(blankValues, [], {
        clearBlank: true,
        dirtyFields: {},
      }),
    ).toEqual({})
  })
})
