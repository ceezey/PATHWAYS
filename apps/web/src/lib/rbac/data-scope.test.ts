import { describe, expect, it } from 'vitest'

import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import {
  buildBeneficiarySadddAggregatesForRole,
  canAccessBeneficiaryForRole,
  canAccessProjectForRole,
  canConfigureProjectAssignment,
  scopeBeneficiariesForRole,
  scopeProjectRecordsForRole,
  scopeProjectsForRole,
} from './data-scope'

const makeProject = (id: string): ProjectSummary => ({
  id,
  title: id,
  area: 'Test area',
  sector: 'Test sector',
  status: 'Active',
  health: 'On Track',
  period: '2026',
  projectManager: 'Test manager',
  kpiAchievement: 0,
  beneficiariesReached: 0,
  budgetUtilization: 0,
  timelineProgress: 0,
})

const testProjects = [
  makeProject('project-alpha'),
  makeProject('project-beta'),
  makeProject('project-gamma'),
]

const testProjectRecords = [
  { id: 'record-alpha-one', projectId: 'project-alpha' },
  { id: 'record-alpha-two', projectId: 'project-alpha' },
  { id: 'record-beta', projectId: 'project-beta' },
  { id: 'record-gamma', projectId: 'project-gamma' },
]

const makeBeneficiary = (
  id: string,
  projectIds: string[],
  sex: BeneficiaryRecord['sex'] = 'Female',
): BeneficiaryRecord => ({
  id,
  code: `TEST-${id}`,
  displayName: `Test ${id}`,
  firstName: 'Test',
  lastName: id,
  projectIds,
  location: 'Test city',
  province: 'Test province',
  city: 'Test city',
  barangay: 'Test barangay',
  sex,
  age: 20,
  ageGroup: '18-24',
  disabilityStatus: 'Without disability',
  enrollmentStatus: 'Active',
  consentToParticipate: true,
  consentToStoreData: true,
  isMinor: false,
  guardianConsent: false,
  enrollments: [],
  participation: [],
  assessments: [],
  notes: [],
})

const testBeneficiaries = [
  makeBeneficiary('beneficiary-alpha', ['project-alpha']),
  makeBeneficiary('beneficiary-beta', ['project-beta'], 'Male'),
  makeBeneficiary('beneficiary-gamma', ['project-gamma'], 'Prefer not to say'),
  makeBeneficiary('beneficiary-shared', ['project-alpha', 'project-beta']),
]

const assignmentIdsByRole: Partial<Record<PathwaysRole, readonly string[]>> = {
  'Project Manager': ['project-alpha'],
  'Project Officer': ['project-alpha'],
  'Monitoring and Evaluation Officer': ['project-alpha', 'project-beta'],
}

const assignmentIds = (role: PathwaysRole) => assignmentIdsByRole[role] ?? []

const projectIds = (role: PathwaysRole) =>
  scopeProjectsForRole(testProjects, role, assignmentIds(role)).map((project) => project.id)

const beneficiaryIds = (role: PathwaysRole) =>
  scopeBeneficiariesForRole(testBeneficiaries, role, assignmentIds(role)).map(
    (beneficiary) => beneficiary.id,
  )

const beneficiaryById = (id: string) => {
  const beneficiary = testBeneficiaries.find((record) => record.id === id)

  if (!beneficiary) {
    throw new Error(`Expected test Beneficiary ${id}.`)
  }

  return beneficiary
}

describe('RBAC project assignments and data scope', () => {
  it('fails closed without explicit assignment inputs for assigned-project roles', () => {
    expect(canAccessProjectForRole('Project Manager', 'project-alpha')).toBe(false)
    expect(canAccessProjectForRole('Project Manager', 'project-alpha', ['project-alpha'])).toBe(
      true,
    )
  })

  it('shows assigned roles only their projects and portfolio roles all projects', () => {
    const allProjectIds = testProjects.map((project) => project.id)

    expect(projectIds('Project Manager')).toEqual(['project-alpha'])
    expect(projectIds('Project Officer')).toEqual(['project-alpha'])
    expect(projectIds('Monitoring and Evaluation Officer')).toEqual([
      'project-alpha',
      'project-beta',
    ])
    expect(projectIds('Program Manager')).toEqual(allProjectIds)
    expect(projectIds('Grant Manager')).toEqual(allProjectIds)
    expect(projectIds('System Administrator')).toEqual(allProjectIds)
  })

  it('checks individual project access against the same assignment input', () => {
    expect(
      canAccessProjectForRole('Project Manager', 'project-alpha', assignmentIds('Project Manager')),
    ).toBe(true)
    expect(
      canAccessProjectForRole('Project Manager', 'project-beta', assignmentIds('Project Manager')),
    ).toBe(false)
    expect(
      canAccessProjectForRole('Project Officer', 'project-gamma', assignmentIds('Project Officer')),
    ).toBe(false)
    expect(
      canAccessProjectForRole(
        'Monitoring and Evaluation Officer',
        'project-beta',
        assignmentIds('Monitoring and Evaluation Officer'),
      ),
    ).toBe(true)
    expect(canAccessProjectForRole('Program Manager', 'project-gamma')).toBe(true)
    expect(canAccessProjectForRole('Grant Manager', 'project-gamma')).toBe(true)
    expect(canAccessProjectForRole('System Administrator', 'project-gamma')).toBe(true)
  })

  it('scopes project-linked records through the same assignment helper', () => {
    expect(
      scopeProjectRecordsForRole(
        testProjectRecords,
        'Project Manager',
        assignmentIds('Project Manager'),
      ).map((record) => record.id),
    ).toEqual(['record-alpha-one', 'record-alpha-two'])
    expect(
      scopeProjectRecordsForRole(
        testProjectRecords,
        'Monitoring and Evaluation Officer',
        assignmentIds('Monitoring and Evaluation Officer'),
      ).map((record) => record.id),
    ).toEqual(['record-alpha-one', 'record-alpha-two', 'record-beta'])
    expect(scopeProjectRecordsForRole(testProjectRecords, 'Program Manager')).toHaveLength(
      testProjectRecords.length,
    )
  })

  it('returns no individual records to aggregate-only roles', () => {
    expect(beneficiaryIds('Program Manager')).toEqual([])
    expect(beneficiaryIds('Grant Manager')).toEqual([])
  })

  it('scopes individual Beneficiary records to assignments and preserves administrator access', () => {
    expect(beneficiaryIds('Project Manager')).toEqual(['beneficiary-alpha', 'beneficiary-shared'])
    expect(beneficiaryIds('Project Officer')).toEqual(['beneficiary-alpha', 'beneficiary-shared'])
    expect(beneficiaryIds('Monitoring and Evaluation Officer')).toEqual([
      'beneficiary-alpha',
      'beneficiary-beta',
      'beneficiary-shared',
    ])
    expect(beneficiaryIds('System Administrator')).toEqual(
      testBeneficiaries.map((beneficiary) => beneficiary.id),
    )
  })

  it('uses the same assignment check for direct Beneficiary record access', () => {
    const alpha = beneficiaryById('beneficiary-alpha')
    const beta = beneficiaryById('beneficiary-beta')
    const gamma = beneficiaryById('beneficiary-gamma')

    expect(canAccessBeneficiaryForRole('System Administrator', gamma)).toBe(true)
    expect(canAccessBeneficiaryForRole('Program Manager', alpha)).toBe(false)
    expect(canAccessBeneficiaryForRole('Grant Manager', alpha)).toBe(false)
    expect(
      canAccessBeneficiaryForRole('Project Manager', alpha, assignmentIds('Project Manager')),
    ).toBe(true)
    expect(
      canAccessBeneficiaryForRole('Project Manager', beta, assignmentIds('Project Manager')),
    ).toBe(false)
    expect(
      canAccessBeneficiaryForRole('Project Officer', alpha, assignmentIds('Project Officer')),
    ).toBe(true)
    expect(
      canAccessBeneficiaryForRole('Project Officer', gamma, assignmentIds('Project Officer')),
    ).toBe(false)
    expect(
      canAccessBeneficiaryForRole(
        'Monitoring and Evaluation Officer',
        alpha,
        assignmentIds('Monitoring and Evaluation Officer'),
      ),
    ).toBe(true)
    expect(
      canAccessBeneficiaryForRole(
        'Monitoring and Evaluation Officer',
        beta,
        assignmentIds('Monitoring and Evaluation Officer'),
      ),
    ).toBe(true)
    expect(
      canAccessBeneficiaryForRole(
        'Monitoring and Evaluation Officer',
        gamma,
        assignmentIds('Monitoring and Evaluation Officer'),
      ),
    ).toBe(false)
  })

  it('builds aggregate SADDD counts without Beneficiary identity fields', () => {
    const aggregates = buildBeneficiarySadddAggregatesForRole(testBeneficiaries, 'Grant Manager')
    const serialized = JSON.stringify(aggregates)

    expect(aggregates.length).toBeGreaterThan(0)
    expect(aggregates.every((item) => item.count > 0)).toBe(true)
    expect(serialized).not.toMatch(
      /beneficiaryId|beneficiaryCode|displayName|firstName|lastName|birthDate|barangay|notes|assessments|media/i,
    )
  })

  it('limits project-assignment authority by target role and actor project scope', () => {
    expect(
      canConfigureProjectAssignment('System Administrator', 'Project Manager', 'project-alpha'),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment(
        'System Administrator',
        'Monitoring and Evaluation Officer',
        'project-beta',
      ),
    ).toBe(true)

    expect(
      canConfigureProjectAssignment('Program Manager', 'Project Manager', 'project-alpha'),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment(
        'Program Manager',
        'Monitoring and Evaluation Officer',
        'project-beta',
      ),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment('Program Manager', 'Project Officer', 'project-alpha'),
    ).toBe(false)

    expect(
      canConfigureProjectAssignment(
        'Project Manager',
        'Project Officer',
        'project-alpha',
        assignmentIds('Project Manager'),
      ),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment(
        'Project Manager',
        'Monitoring and Evaluation Officer',
        'project-alpha',
        assignmentIds('Project Manager'),
      ),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment(
        'Project Manager',
        'Project Officer',
        'project-beta',
        assignmentIds('Project Manager'),
      ),
    ).toBe(false)
    expect(
      canConfigureProjectAssignment(
        'Project Manager',
        'Project Manager',
        'project-alpha',
        assignmentIds('Project Manager'),
      ),
    ).toBe(false)

    expect(
      canConfigureProjectAssignment('Project Officer', 'Project Officer', 'project-alpha'),
    ).toBe(false)
    expect(
      canConfigureProjectAssignment(
        'Monitoring and Evaluation Officer',
        'Monitoring and Evaluation Officer',
        'project-alpha',
      ),
    ).toBe(false)
    expect(canConfigureProjectAssignment('Grant Manager', 'Project Manager', 'project-alpha')).toBe(
      false,
    )
  })
})
