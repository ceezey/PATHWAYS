import { describe, expect, it } from 'vitest'

import { mockUsers } from '@/mocks/pathways/users'

import {
  getEligibleTeamUsers,
  parseProjectOfficerNames,
  validateProjectTeamSelections,
} from './project-team-selectors'

describe('Project Team selector rules', () => {
  it('uses only active users with the exact eligible role', () => {
    expect(getEligibleTeamUsers(mockUsers, 'Project Officer')).toEqual([
      expect.objectContaining({ id: 'user-project-officer-a', name: 'Project Officer A' }),
    ])
    expect(getEligibleTeamUsers(mockUsers, 'Program Manager')).toEqual([
      expect.objectContaining({ id: 'user-program-manager-a', name: 'Program Manager A' }),
    ])
  })

  it('keeps comma-separated form state compatible with multiple officer names', () => {
    expect(parseProjectOfficerNames('Project Officer A, Project Officer B')).toEqual([
      'Project Officer A',
      'Project Officer B',
    ])
  })

  it('accepts active exact-name selections and rejects unavailable legacy values', () => {
    expect(
      validateProjectTeamSelections(
        {
          monitoringOfficer: 'Monitoring and Evaluation Officer A',
          programManager: 'Program Manager A',
          projectManager: 'Project Manager A',
          projectOfficers: 'Project Officer A',
        },
        mockUsers,
      ),
    ).toEqual({})

    expect(
      validateProjectTeamSelections(
        {
          monitoringOfficer: 'Monitoring and Evaluation Officer A',
          programManager: 'Historical Program Manager',
          projectManager: 'Project Manager A',
          projectOfficers: 'Project Officer Invite',
        },
        mockUsers,
      ),
    ).toEqual({
      programManager: 'Select an active Program Manager from the list.',
      projectOfficers: 'Select at least one active Project Officer from the list.',
    })
  })
})
