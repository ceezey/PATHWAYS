import type { ProjectSummary, UserRecord } from '@/types/pathways'
import { describe, expect, it } from 'vitest'
import {
  canManageUserRecord,
  filterUserRecords,
  getAssignableProjects,
  getManageableUserRoles,
  getProjectAccessLabels,
  getUserInitials,
  userAccountStatusTone,
} from './user-management-utils'

const makeProject = (id: string, title: string): ProjectSummary => ({
  id,
  title,
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
  makeProject('project-alpha', 'Project Alpha'),
  makeProject('project-beta', 'Project Beta'),
]
const projectManagerAssignments = ['project-alpha']

const makeUser = (
  id: string,
  name: string,
  role: UserRecord['role'],
  projectIds: string[] = [],
  accountStatus: UserRecord['accountStatus'] = 'Active',
): UserRecord => ({
  id,
  name,
  email: `${id}@example.test`,
  role,
  accountStatus,
  signInMethod: 'Single sign-on',
  projectIds,
  projectAccess: projectIds.map(
    (projectId) => testProjects.find((project) => project.id === projectId)?.title ?? projectId,
  ),
  createdAt: '2026-01-01T00:00:00.000Z',
})

const testUsers = [
  makeUser('program-manager', 'Program Manager One', 'Program Manager'),
  makeUser('grant-manager', 'Grant Manager One', 'Grant Manager'),
  makeUser('project-manager', 'Project Manager One', 'Project Manager', ['project-alpha']),
  makeUser('monitoring-officer', 'Monitoring Officer One', 'Monitoring and Evaluation Officer', [
    'project-alpha',
    'project-beta',
  ]),
  makeUser('project-officer', 'Project Officer One', 'Project Officer', ['project-alpha']),
  makeUser('system-administrator', 'System Administrator One', 'System Administrator'),
  makeUser(
    'invited-project-officer',
    'Invited Project Officer',
    'Project Officer',
    ['project-beta'],
    'Invited',
  ),
]

const getTestUser = (id: string) => {
  const user = testUsers.find((record) => record.id === id)

  if (!user) {
    throw new Error(`Missing test user ${id}`)
  }

  return user
}

describe('user management utilities', () => {
  it('filters users by name, email, role, or project access', () => {
    expect(filterUserRecords(testUsers, 'Project Alpha', 'All').map((user) => user.id)).toEqual([
      'project-manager',
      'monitoring-officer',
      'project-officer',
    ])
    expect(filterUserRecords(testUsers, 'monitoring-officer@example.test', 'All')).toHaveLength(1)
    expect(filterUserRecords(testUsers, 'Grant Manager', 'All')).toEqual([
      expect.objectContaining({ id: 'grant-manager', role: 'Grant Manager' }),
    ])
    expect(filterUserRecords(testUsers, 'System Administrator', 'All')).toHaveLength(1)
  })

  it('combines account status and text filters', () => {
    expect(filterUserRecords(testUsers, '', 'Invited')).toHaveLength(1)
    expect(filterUserRecords(testUsers, 'Project Officer', 'Active')).toHaveLength(1)
    expect(filterUserRecords(testUsers, 'no matching user', 'All')).toEqual([])
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
      getAssignableProjects('System Administrator', 'Project Manager', testProjects),
    ).toHaveLength(testProjects.length)
    expect(getAssignableProjects('Program Manager', 'Project Officer', testProjects)).toEqual([])
    expect(
      getAssignableProjects(
        'Project Manager',
        'Project Officer',
        testProjects,
        projectManagerAssignments,
      ).map((project) => project.id),
    ).toEqual(['project-alpha'])
    expect(
      getAssignableProjects(
        'Project Manager',
        'Monitoring and Evaluation Officer',
        testProjects,
        projectManagerAssignments,
      ).map((project) => project.id),
    ).toEqual(['project-alpha'])
  })

  it('prevents account actions when a target role or assignment is outside actor authority', () => {
    const systemAdministrator = getTestUser('system-administrator')
    const projectManager = getTestUser('project-manager')
    const monitoringOfficer = getTestUser('monitoring-officer')
    const assignedProjectOfficer = getTestUser('project-officer')
    const outsideProjectOfficer = getTestUser('invited-project-officer')

    expect(canManageUserRecord('System Administrator', systemAdministrator)).toBe(true)
    expect(canManageUserRecord('Program Manager', projectManager)).toBe(true)
    expect(canManageUserRecord('Program Manager', assignedProjectOfficer)).toBe(false)
    expect(
      canManageUserRecord('Project Manager', assignedProjectOfficer, projectManagerAssignments),
    ).toBe(true)
    expect(
      canManageUserRecord('Project Manager', monitoringOfficer, projectManagerAssignments),
    ).toBe(false)
    expect(
      canManageUserRecord('Project Manager', outsideProjectOfficer, projectManagerAssignments),
    ).toBe(false)
  })

  it('derives readable access labels from selected project identifiers', () => {
    expect(
      getProjectAccessLabels(
        'Monitoring and Evaluation Officer',
        ['project-alpha', 'project-beta'],
        testProjects,
      ),
    ).toEqual(['Project Alpha', 'Project Beta'])
    expect(getProjectAccessLabels('Grant Manager', [], testProjects)).toEqual([
      'Organization grant portfolio',
    ])
  })
})
