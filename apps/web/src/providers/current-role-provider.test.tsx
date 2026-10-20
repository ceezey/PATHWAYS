// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationProfile } from '@/lib/auth/auth-access'
import { encodeWorkspaceContext } from '@/lib/auth/workspace-access'
import type { WorkspaceVerification } from '@/lib/auth/workspace-verification'

const verify = vi.hoisted(() => ({ fn: vi.fn() }))

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))

const session = { access_token: 'tok-1', user: { id: 'sub-1' } }
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ session, status: 'authenticated' }),
}))

vi.mock('@/lib/auth/workspace-verification', async (importOriginal) => {
  const original = await importOriginal<object>()
  return {
    ...original,
    verifyWorkspace: (...args: unknown[]) => verify.fn(...args),
  }
})

// eslint-disable-next-line import/first
import { CurrentRoleProvider, useCurrentRole } from './current-role-provider'

const profile = (overrides: Partial<ApplicationProfile> = {}): ApplicationProfile => ({
  id: 'profile-1',
  userId: 'user-1',
  organizationId: 'org-1',
  fullName: 'Test User',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: [],
  assignedProjectIds: [],
  aal: 'aal2',
  ...overrides,
})

const ready = (overrides: Partial<ApplicationProfile> = {}): WorkspaceVerification => ({
  access: 'ready',
  profile: profile(overrides),
  mfa: null,
  error: null,
  clearContext: false,
})

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

let triggerRefresh: (() => Promise<void>) | null = null
let settledOrder: string[] = []

const Probe = () => {
  const { profile: current, refreshAccess } = useCurrentRole()
  triggerRefresh = () => {
    const label = `call-${settledOrder.length + 1}`
    return refreshAccess().then(() => {
      settledOrder.push(label)
    })
  }
  return <span data-testid="role">{current?.roles[0] ?? 'none'}</span>
}

beforeEach(() => {
  settledOrder = []
  triggerRefresh = null
  verify.fn.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('CurrentRoleProvider refreshAccess', () => {
  it('resolves a trailing refresh only after a verification that started after the call, not the in-flight one', async () => {
    const first = deferred<WorkspaceVerification>()
    const second = deferred<WorkspaceVerification>()
    verify.fn.mockImplementationOnce(() => first.promise)
    verify.fn.mockImplementationOnce(() => second.promise)

    render(
      <CurrentRoleProvider>
        <Probe />
      </CurrentRoleProvider>,
    )

    // The initial mount already starts the first verification.
    await waitFor(() => expect(verify.fn).toHaveBeenCalledTimes(1))

    // Request a refresh while the first verification is still in flight.
    let trailingResolved = false
    act(() => {
      triggerRefresh?.().then(() => {
        trailingResolved = true
      })
    })

    // Still only one verification call: the trailing request must not have
    // started a second one yet (it only marks intent).
    expect(verify.fn).toHaveBeenCalledTimes(1)
    expect(trailingResolved).toBe(false)

    // Finishing the first (stale-by-the-time-it-lands) verification must not
    // resolve the trailing caller's promise.
    await act(async () => {
      first.resolve(ready({ roles: ['PROGRAM_MANAGER'] }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(trailingResolved).toBe(false)

    // It must instead have started a second verification.
    await waitFor(() => expect(verify.fn).toHaveBeenCalledTimes(2))

    await act(async () => {
      second.resolve(ready({ roles: ['MONITORING_AND_EVALUATION_OFFICER'] }))
    })

    await waitFor(() => expect(trailingResolved).toBe(true))
    await waitFor(() =>
      expect(screen.getByTestId('role').textContent).toBe('MONITORING_AND_EVALUATION_OFFICER'),
    )
  })
})

describe('CurrentRoleProvider workspace context cookie', () => {
  afterEach(() => {
    document.cookie = 'pathways-context=; Path=/; Max-Age=0'
    session.user.id = 'sub-1'
  })

  it('writes the verified workspace to the context cookie', async () => {
    verify.fn.mockResolvedValue(ready())
    render(
      <CurrentRoleProvider>
        <Probe />
      </CurrentRoleProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('SYSTEM_ADMINISTRATOR'))
    expect(document.cookie).toContain(`pathways-context=${encodeWorkspaceContext(profile())}`)
  })

  it('sends the workspace in the context cookie as the verification hint', async () => {
    const subject = '71000000-0000-4000-8000-000000000001'
    const context = {
      userId: '71000000-0000-4000-8000-000000000002',
      organizationId: '71000000-0000-4000-8000-000000000003',
    }
    session.user.id = subject
    document.cookie = 'theme=dark; Path=/'
    document.cookie = `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId: subject, ...context }))}; Path=/`
    verify.fn.mockResolvedValue(ready())
    render(
      <CurrentRoleProvider>
        <Probe />
      </CurrentRoleProvider>,
    )

    await waitFor(() => expect(verify.fn).toHaveBeenCalledTimes(1))
    expect(verify.fn.mock.calls[0][4]).toEqual(context)
  })
})
