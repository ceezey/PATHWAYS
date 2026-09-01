import { describe, expect, it } from 'vitest'

import { mockProjects, mockUsers } from '@/mocks/pathways'
import {
  canManageUserRecord,
  filterUserRecords,
  getAssignableProjects,
  getManageableUserRoles,
  getProjectAccessLabels,
  getUserInitials,
  userAccountStatusTone,
} from './user-management-utils'

const getMockUser = (id: string) => {
  const user = mockUsers.find((record) => record.id === id)

  if (!user) {
    throw new Error(`Missing mock user ${id}`)
  }

  return user
}

describe('user management utilities', () => {
  it('filters users by name, email, role, or project access', () => {
    expect(filterUserRecords(mockUsers, 'futuremakers', 'All').map((user) => user.id)).toEqual([
      'user-project-manager-a',
      'user-me-officer-a',
      'user-project-officer-a',
    ])
    expect(filterUserRecords(mockUsers, 'monitoring.officer', 'All')).toHaveLength(1)
    expect(filterUserRecords(mockUsers, 'Grant Manager', 'All')).toEqual([
      expect.objectContaining({ id: 'user-grant-manager-a', role: 'Grant Manager' }),
    ])
    expect(filterUserRecords(mockUsers, 'System Administrator', 'All')).toHaveLength(1)
  })

  it('combines account status and text filters', () => {
    expect(filterUserRecords(mockUsers, '', 'Invited')).toHaveLength(1)
    expect(filterUserRecords(mockUsers, 'Project Officer', 'Active')).toHaveLength(1)
    expect(filterUserRecords(mockUsers, 'no matching user', 'All')).toEqual([])
  })

  it('provides concise initials and status tones', () => {
    expect(getUserInitials('Monitoring and Evaluation Officer A')).toBe('MA')
    expect(getUserInitials('')).toBe('U')
    expect(userAccountStatusTone('Active')).toBe('success')
    expect(userAccountStatusTone('Invited')).toBe('info')
    expect(userAccountStatusTone('Deactivated')).toBe('neutral')
  })

  it('derives target-role options from the locked account hierarchy', () => {
    expect(getManageableUserRoles('System Administrator')).toEqual([
      'Program Manager',
      'Grant Manager',
      'Project Manager',
      'Monitoring and Evaluation Officer',
      'Project Officer',
      'System Administrator',
    ])
    expect(getManageableUserRoles('Program Manager')).toEqual([
      'Project Manager',
      'Monitoring and Evaluation Officer',
    ])
    expect(getManageableUserRoles('Project Manager')).toEqual([
      'Project Officer',
      'Monitoring and Evaluation Officer',
    ])
    expect(getManageableUserRoles('Project Officer')).toEqual([])
    expect(getManageableUserRoles('Monitoring and Evaluation Officer')).toEqual([])
    expect(getManageableUserRoles('Grant Manager')).toEqual([])
  })

  it('limits project choices to the actor and target-role assignment scope', () => {
    expect(
      getAssignableProjects('System Administrator', 'Project Manager', mockProjects),
    ).toHaveLength(mockProjects.length)
    expect(getAssignableProjects('Program Manager', 'Project Officer', mockProjects)).toEqual([])
    expect(
      getAssignableProjects('Project Manager', 'Project Officer', mockProjects).map(
        (project) => project.id,
      ),
    ).toEqual(['futuremakers-ncr'])
    expect(
      getAssignableProjects(
        'Project Manager',
        'Monitoring and Evaluation Officer',
        mockProjects,
      ).map((project) => project.id),
    ).toEqual(['futuremakers-ncr'])
  })

  it('prevents account actions when a target role or assignment is outside actor authority', () => {
    const systemAdministrator = getMockUser('user-system-admin-a')
    const projectManager = getMockUser('user-project-manager-a')
    const monitoringOfficer = getMockUser('user-me-officer-a')
    const assignedProjectOfficer = getMockUser('user-project-officer-a')
    const outsideProjectOfficer = getMockUser('user-project-officer-invited')

    expect(canManageUserRecord('System Administrator', systemAdministrator)).toBe(true)
    expect(canManageUserRecord('Program Manager', projectManager)).toBe(true)
    expect(canManageUserRecord('Program Manager', assignedProjectOfficer)).toBe(false)
    expect(canManageUserRecord('Project Manager', assignedProjectOfficer)).toBe(true)
    expect(canManageUserRecord('Project Manager', monitoringOfficer)).toBe(false)
    expect(canManageUserRecord('Project Manager', outsideProjectOfficer)).toBe(false)
  })

  it('derives readable access labels from selected project identifiers', () => {
    expect(
      getProjectAccessLabels(
        'Monitoring and Evaluation Officer',
        ['futuremakers-ncr', 'grassroots-centers-navotas'],
        mockProjects,
      ),
    ).toEqual(['FutureMakers NCR', 'Grassroots Centers - Navotas'])
    expect(getProjectAccessLabels('Grant Manager', [], mockProjects)).toEqual([
      'Organization grant portfolio',
    ])
  })
})
