import { describe, expect, it } from 'vitest'

import { mockUsers } from '@/mocks/pathways'
import { filterUserRecords, getUserInitials, userAccountStatusTone } from './user-management-utils'

describe('user management utilities', () => {
  it('filters users by name, email, role, or project access', () => {
    expect(filterUserRecords(mockUsers, 'futuremakers', 'All').map((user) => user.id)).toEqual([
      'user-project-manager-a',
      'user-project-officer-a',
    ])
    expect(filterUserRecords(mockUsers, 'monitoring.officer', 'All')).toHaveLength(1)
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
})
