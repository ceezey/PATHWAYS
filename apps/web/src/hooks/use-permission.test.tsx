// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const role = vi.hoisted(() => ({
  profile: null as null | { roles: string[]; permissions: string[]; assignedProjectIds: string[] },
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => role }))

import { permissionChecker } from '@/lib/rbac/policy'
import { usePermission } from './use-permission'

afterEach(cleanup)

describe('usePermission', () => {
  it('grants a listed permission and denies one absent from the grant list', () => {
    role.profile = {
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read'],
      assignedProjectIds: [],
    }
    const { result } = renderHook(() => usePermission())
    expect(result.current('activities.read')).toBe(true)
    expect(result.current('activities.create')).toBe(false)
  })

  it('denies without a profile and when the role does not hold a listed grant', () => {
    expect(permissionChecker(null)('activities.read')).toBe(false)
    const manager = {
      roles: ['PROGRAM_MANAGER'],
      permissions: ['beneficiaries.records.read'],
      assignedProjectIds: [],
    }
    expect(permissionChecker(manager)('beneficiaries.records.read')).toBe(false)
  })
})
