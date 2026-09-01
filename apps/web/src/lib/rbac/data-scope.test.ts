import { afterEach, describe, expect, it } from 'vitest'

import { mockAlerts, mockBeneficiaryRecords, mockProjects } from '@/mocks/pathways'
import type { PrototypeRole } from '@/types/prototype-role'
import {
  buildBeneficiarySadddAggregatesForRole,
  canAccessBeneficiaryForRole,
  canAccessProjectForRole,
  canConfigureProjectAssignment,
  getAssignedProjectIds,
  resetPrototypeProjectAssignmentOverrides,
  scopeBeneficiariesForRole,
  scopeProjectRecordsForRole,
  scopeProjectsForRole,
  setPrototypeProjectAssignments,
} from './data-scope'

const projectIds = (role: PrototypeRole) =>
  scopeProjectsForRole(mockProjects, role).map((project) => project.id)

const beneficiaryIds = (role: PrototypeRole) =>
  scopeBeneficiariesForRole(mockBeneficiaryRecords, role).map((beneficiary) => beneficiary.id)

const beneficiaryById = (id: string) => {
  const beneficiary = mockBeneficiaryRecords.find((record) => record.id === id)

  if (!beneficiary) {
    throw new Error(`Expected mock Beneficiary ${id}.`)
  }

  return beneficiary
}

describe('prototype project assignments and data scope', () => {
  afterEach(() => {
    resetPrototypeProjectAssignmentOverrides()
  })

  it('uses one exact demo assignment set for each assigned-project role', () => {
    expect(getAssignedProjectIds('Project Manager')).toEqual(['futuremakers-ncr'])
    expect(getAssignedProjectIds('Project Officer')).toEqual(['futuremakers-ncr'])
    expect(getAssignedProjectIds('Monitoring and Evaluation Officer')).toEqual([
      'futuremakers-ncr',
      'grassroots-centers-navotas',
    ])

    expect(getAssignedProjectIds('Program Manager')).toEqual([])
    expect(getAssignedProjectIds('Grant Manager')).toEqual([])
    expect(getAssignedProjectIds('System Administrator')).toEqual([])
  })

  it('shows assigned roles only their assigned projects and portfolio roles all projects', () => {
    const allProjectIds = mockProjects.map((project) => project.id)

    expect(projectIds('Project Manager')).toEqual(['futuremakers-ncr'])
    expect(projectIds('Project Officer')).toEqual(['futuremakers-ncr'])
    expect(projectIds('Monitoring and Evaluation Officer')).toEqual([
      'futuremakers-ncr',
      'grassroots-centers-navotas',
    ])
    expect(projectIds('Program Manager')).toEqual(allProjectIds)
    expect(projectIds('Grant Manager')).toEqual(allProjectIds)
    expect(projectIds('System Administrator')).toEqual(allProjectIds)
  })

  it('checks individual project access against the same centralized assignments', () => {
    expect(canAccessProjectForRole('Project Manager', 'futuremakers-ncr')).toBe(true)
    expect(canAccessProjectForRole('Project Manager', 'grassroots-centers-navotas')).toBe(false)
    expect(canAccessProjectForRole('Project Officer', 'youth-rise-western-samar')).toBe(false)
    expect(
      canAccessProjectForRole('Monitoring and Evaluation Officer', 'grassroots-centers-navotas'),
    ).toBe(true)
    expect(canAccessProjectForRole('Program Manager', 'safe-spaces-northern-samar')).toBe(true)
    expect(canAccessProjectForRole('Grant Manager', 'safe-spaces-northern-samar')).toBe(true)
    expect(canAccessProjectForRole('System Administrator', 'safe-spaces-northern-samar')).toBe(true)
  })

  it('scopes project-linked records through the same assignment helper', () => {
    expect(
      scopeProjectRecordsForRole(mockAlerts, 'Project Manager').map((alert) => alert.projectId),
    ).toEqual(['futuremakers-ncr', 'futuremakers-ncr'])
    expect([
      ...new Set(
        scopeProjectRecordsForRole(mockAlerts, 'Monitoring and Evaluation Officer').map(
          (alert) => alert.projectId,
        ),
      ),
    ]).toEqual(['futuremakers-ncr', 'grassroots-centers-navotas'])
    expect(scopeProjectRecordsForRole(mockAlerts, 'Program Manager')).toHaveLength(
      mockAlerts.length,
    )
  })

  it('returns no individual records to aggregate-only roles', () => {
    expect(beneficiaryIds('Program Manager')).toEqual([])
    expect(beneficiaryIds('Grant Manager')).toEqual([])
  })

  it('scopes individual Beneficiary records to assignments and preserves administrator access', () => {
    const futureMakersBeneficiaryIds = mockBeneficiaryRecords
      .filter((beneficiary) => beneficiary.projectIds.includes('futuremakers-ncr'))
      .map((beneficiary) => beneficiary.id)
    const monitoredBeneficiaryIds = mockBeneficiaryRecords
      .filter((beneficiary) =>
        beneficiary.projectIds.some((projectId) =>
          ['futuremakers-ncr', 'grassroots-centers-navotas'].includes(projectId),
        ),
      )
      .map((beneficiary) => beneficiary.id)

    expect(beneficiaryIds('Project Manager')).toEqual(futureMakersBeneficiaryIds)
    expect(beneficiaryIds('Project Officer')).toEqual(futureMakersBeneficiaryIds)
    expect(beneficiaryIds('Monitoring and Evaluation Officer')).toEqual(monitoredBeneficiaryIds)
    expect(beneficiaryIds('System Administrator')).toEqual(
      mockBeneficiaryRecords.map((beneficiary) => beneficiary.id),
    )
  })

  it('uses the same assignment check for direct Beneficiary record access', () => {
    const futureMakers = beneficiaryById('ben-001')
    const youthRise = beneficiaryById('ben-002')
    const navotas = beneficiaryById('ben-003')

    expect(canAccessBeneficiaryForRole('System Administrator', youthRise)).toBe(true)
    expect(canAccessBeneficiaryForRole('Program Manager', futureMakers)).toBe(false)
    expect(canAccessBeneficiaryForRole('Grant Manager', futureMakers)).toBe(false)
    expect(canAccessBeneficiaryForRole('Project Manager', futureMakers)).toBe(true)
    expect(canAccessBeneficiaryForRole('Project Manager', youthRise)).toBe(false)
    expect(canAccessBeneficiaryForRole('Project Officer', futureMakers)).toBe(true)
    expect(canAccessBeneficiaryForRole('Project Officer', navotas)).toBe(false)
    expect(canAccessBeneficiaryForRole('Monitoring and Evaluation Officer', futureMakers)).toBe(
      true,
    )
    expect(canAccessBeneficiaryForRole('Monitoring and Evaluation Officer', navotas)).toBe(true)
    expect(canAccessBeneficiaryForRole('Monitoring and Evaluation Officer', youthRise)).toBe(false)
  })

  it('builds aggregate SADDD counts without Beneficiary identity fields', () => {
    const aggregates = buildBeneficiarySadddAggregatesForRole(
      mockBeneficiaryRecords,
      'Grant Manager',
    )
    const serialized = JSON.stringify(aggregates)

    expect(aggregates.length).toBeGreaterThan(0)
    expect(aggregates.every((item) => item.count > 0)).toBe(true)
    expect(serialized).not.toMatch(
      /beneficiaryId|beneficiaryCode|displayName|firstName|lastName|birthDate|barangay|notes|assessments|media/i,
    )
  })

  it('limits project-assignment authority by target role and actor project scope', () => {
    expect(
      canConfigureProjectAssignment('System Administrator', 'Project Manager', 'futuremakers-ncr'),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment(
        'System Administrator',
        'Monitoring and Evaluation Officer',
        'grassroots-centers-navotas',
      ),
    ).toBe(true)

    expect(
      canConfigureProjectAssignment('Program Manager', 'Project Manager', 'futuremakers-ncr'),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment(
        'Program Manager',
        'Monitoring and Evaluation Officer',
        'grassroots-centers-navotas',
      ),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment('Program Manager', 'Project Officer', 'futuremakers-ncr'),
    ).toBe(false)

    expect(
      canConfigureProjectAssignment('Project Manager', 'Project Officer', 'futuremakers-ncr'),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment(
        'Project Manager',
        'Monitoring and Evaluation Officer',
        'futuremakers-ncr',
      ),
    ).toBe(true)
    expect(
      canConfigureProjectAssignment(
        'Project Manager',
        'Project Officer',
        'grassroots-centers-navotas',
      ),
    ).toBe(false)
    expect(
      canConfigureProjectAssignment('Project Manager', 'Project Manager', 'futuremakers-ncr'),
    ).toBe(false)

    expect(
      canConfigureProjectAssignment('Project Officer', 'Project Officer', 'futuremakers-ncr'),
    ).toBe(false)
    expect(
      canConfigureProjectAssignment(
        'Monitoring and Evaluation Officer',
        'Monitoring and Evaluation Officer',
        'futuremakers-ncr',
      ),
    ).toBe(false)
    expect(
      canConfigureProjectAssignment('Grant Manager', 'Project Manager', 'futuremakers-ncr'),
    ).toBe(false)
  })

  it('propagates browser-local assignment changes to scoped project and Beneficiary views', () => {
    setPrototypeProjectAssignments('Project Manager', ['grassroots-centers-navotas'])
    setPrototypeProjectAssignments('Monitoring and Evaluation Officer', [
      'futuremakers-ncr',
      'safe-spaces-northern-samar',
    ])

    expect(projectIds('Project Manager')).toEqual(['grassroots-centers-navotas'])
    expect(getAssignedProjectIds('Monitoring and Evaluation Officer')).toEqual([
      'futuremakers-ncr',
      'safe-spaces-northern-samar',
    ])
    expect(beneficiaryIds('Project Manager')).toEqual(
      mockBeneficiaryRecords
        .filter((beneficiary) => beneficiary.projectIds.includes('grassroots-centers-navotas'))
        .map((beneficiary) => beneficiary.id),
    )
  })
})
