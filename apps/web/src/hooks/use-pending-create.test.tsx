import type { ApplicationProfile } from '@/features/auth/auth-access'
import {
  pendingCreateKey,
  pendingCreateNotice,
  writePendingCreate,
} from '@/lib/forms/pending-create'
// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePendingCreate } from './use-pending-create'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
const profile = {
  id: 'p',
  userId: 'u',
  organizationId: 'o',
  fullName: 'Synthetic',
  roles: ['PROJECT_MANAGER'],
  permissions: [],
  assignedProjectIds: [],
  aal: 'aal2',
} as ApplicationProfile
const key = pendingCreateKey('project', { organizationId: 'o', userId: 'u', projectId: null })
const setup = (findCreated = vi.fn().mockResolvedValue(null), onConfirmed = vi.fn()) => ({
  findCreated,
  onConfirmed,
  hook: renderHook(() =>
    usePendingCreate({
      profile,
      kind: 'project',
      findCreated,
      onConfirmed,
      successMessage: 'Project created',
    }),
  ),
})
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  sessionStorage.clear()
})

describe('usePendingCreate', () => {
  it('ignores a second submit while the first is in flight', async () => {
    const { hook } = setup()
    let release: (value: string) => void = () => undefined
    const run = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )
    let first: Promise<string | undefined> = Promise.resolve(undefined)
    act(() => {
      first = hook.result.current.submit('a', run)
    })
    await act(async () => {
      expect(await hook.result.current.submit('a', run)).toBeUndefined()
    })
    await act(async () => {
      release('done')
      await first
    })
    expect(run).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('keeps the marker and confirms after a network error', async () => {
    const { hook } = setup()
    await act(async () => {
      await hook.result.current
        .submit('a', () => Promise.reject({ code: 'network' }))
        .catch(() => {})
    })
    expect(sessionStorage.getItem(key)).not.toBeNull()
    expect(hook.result.current.confirming).toBe(true)
  })

  it('clears the marker on a definitive client error', async () => {
    const { hook } = setup()
    await act(async () => {
      await hook.result.current
        .submit('a', () => Promise.reject({ status: 422, code: 'invalid' }))
        .catch(() => {})
    })
    expect(sessionStorage.getItem(key)).toBeNull()
    expect(hook.result.current.confirming).toBe(false)
  })

  it('confirms a record after reload', async () => {
    writePendingCreate(key, { startedAt: Date.now(), fingerprint: 'a' })
    const record = { id: 'new' }
    const { hook, findCreated, onConfirmed } = setup(vi.fn().mockResolvedValue(record))
    expect(hook.result.current.confirming).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(findCreated).toHaveBeenCalledWith('a', expect.any(Number))
    expect(onConfirmed).toHaveBeenCalledWith(record)
    expect(hook.result.current.confirming).toBe(false)
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('re-enables with a notice when nothing is found within 60 seconds', async () => {
    writePendingCreate(key, { startedAt: Date.now(), fingerprint: 'a' })
    const { hook } = setup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(62_000)
    })
    expect(hook.result.current.confirming).toBe(false)
    expect(hook.result.current.notice).toBe(pendingCreateNotice)
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('discards a stale marker on mount', () => {
    writePendingCreate(key, { startedAt: Date.now() - 4 * 60_000, fingerprint: 'a' })
    const { hook, findCreated } = setup()
    expect(hook.result.current.confirming).toBe(false)
    expect(findCreated).not.toHaveBeenCalled()
  })
})
