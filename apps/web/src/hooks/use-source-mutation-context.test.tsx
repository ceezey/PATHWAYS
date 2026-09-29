import type { ApplicationProfile } from '@/features/auth/auth-access'
import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSourceMutationContext } from './use-source-mutation-context'
const project = '20000000-0000-4000-8000-000000000001'
const profile: ApplicationProfile = {
  id: '20000000-0000-4000-8000-000000000002',
  userId: '20000000-0000-4000-8000-000000000003',
  organizationId: '20000000-0000-4000-8000-000000000004',
  fullName: 'Synthetic',
  roles: ['PROJECT_MANAGER'],
  permissions: ['activities.create'],
  assignedProjectIds: [project],
  aal: 'aal2',
}
afterEach(cleanup)
describe('source mutation continuation ownership', () => {
  it('rejects captured A continuations after an A to B to A switch and on unmount', () => {
    const hook = renderHook(
      ({ current }) => useSourceMutationContext(current, 'activities.create', project, null),
      { initialProps: { current: profile } },
    )
    const original = hook.result.current
    expect(original?.isCurrent()).toBe(true)
    hook.rerender({ current: { ...profile, userId: '20000000-0000-4000-8000-000000000099' } })
    expect(original?.isCurrent()).toBe(false)
    hook.rerender({ current: profile })
    expect(original?.isCurrent()).toBe(false)
    expect(hook.result.current?.isCurrent()).toBe(true)
    const current = hook.result.current
    hook.unmount()
    expect(current?.isCurrent()).toBe(false)
  })
  it('rejects current grant or assignment loss and invalidates synchronously on the actual logout cleanup lifecycle', () => {
    const hook = renderHook(
      ({ current }) => useSourceMutationContext(current, 'activities.create', project, null),
      { initialProps: { current: profile } },
    )
    const initial = hook.result.current
    hook.rerender({ current: { ...profile, permissions: [] } })
    expect(hook.result.current).toBeNull()
    expect(initial?.isCurrent()).toBe(false)
    hook.rerender({ current: profile })
    const next = hook.result.current
    hook.rerender({ current: { ...profile, assignedProjectIds: [] } })
    expect(hook.result.current).toBeNull()
    expect(next?.isCurrent()).toBe(false)
    hook.rerender({ current: profile })
    const beforeLogout = hook.result.current
    act(() => clearSensitiveDraftStorage())
    expect(beforeLogout?.isCurrent()).toBe(false)
    expect(hook.result.current?.principalKey).not.toBe(beforeLogout?.principalKey)
  })
})
