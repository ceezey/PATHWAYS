// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  currentRoleState,
  requestRouteCheck,
  refreshAccess,
  resetWorkspaceHandoff,
  RouteCheckErrorMock,
} = vi.hoisted(() => {
  class RouteCheckErrorMock extends Error {
    failure = 'denied'
    status: number
    constructor(status: number) {
      super('denied')
      this.status = status
    }
  }
  return {
    currentRoleState: {
      current: {
        profile: {
          id: 'user-a',
          userId: 'app-user-a',
          organizationId: 'organization-a',
          roles: ['PROJECT_OFFICER'],
          permissions: ['beneficiaries.records.read'],
          assignedProjectIds: ['project-a'],
        },
        accessRefreshing: false,
        verificationRevision: 1,
      },
    },
    requestRouteCheck: vi.fn(),
    refreshAccess: vi.fn(),
    resetWorkspaceHandoff: vi.fn(),
    RouteCheckErrorMock,
  }
})

const allowedDecision = {
  route: 'beneficiaries',
  authorization: 'database-verified',
  beneficiaryAccess: 'records-or-none',
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/beneficiaries',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ session: { access_token: 'test-token', user: { id: 'user-a' } } }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    ...currentRoleState.current,
    refreshAccess,
    resetWorkspaceHandoff,
  }),
}))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000' } }))
vi.mock('@/lib/rbac/route-access', () => {
  return {
    RouteCheckError: RouteCheckErrorMock,
    authorizationPathForUiPath: () => '/beneficiaries',
    getVerifiedRouteAccess: () => ({ allowed: true }),
    matchRoute: () => ({ route: 'beneficiaries' }),
    requestRouteCheck,
  }
})
vi.mock('./beneficiary-access-gate', () => ({
  BeneficiaryAccessGate: ({ children }: { children: ReactNode }) => (
    <div data-testid="beneficiary-pin-gate">{children}</div>
  ),
}))
vi.mock('./unauthorized-state', () => ({
  UnauthorizedState: () => <p>Server denied beneficiary access</p>,
}))

import { RouteAccessGuard } from './route-access-guard'

beforeEach(() => {
  currentRoleState.current.accessRefreshing = false
  currentRoleState.current.verificationRevision = 1
  requestRouteCheck.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RouteAccessGuard beneficiary boundary', () => {
  it('keeps the current route check active while the initial UI stays neutral and fail closed', async () => {
    let resolveCheck!: (decision: typeof allowedDecision) => void
    requestRouteCheck.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = resolve
      }),
    )

    render(
      <RouteAccessGuard>
        <p>Protected beneficiary record</p>
      </RouteAccessGuard>,
    )

    await waitFor(() => expect(requestRouteCheck).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Loading content')).toBeTruthy()
    expect(screen.queryByText(/(?:verifying|rechecking) current (?:route )?access/i)).toBeNull()
    expect(screen.queryByTestId('beneficiary-pin-gate')).toBeNull()
    expect(screen.queryByText('Protected beneficiary record')).toBeNull()

    resolveCheck(allowedDecision)
    expect(await screen.findByText('Protected beneficiary record')).toBeTruthy()
  })

  it('unmounts protected content throughout provider refresh and the new route decision', async () => {
    requestRouteCheck.mockResolvedValueOnce(allowedDecision)
    const view = render(
      <RouteAccessGuard>
        <p>Protected beneficiary record</p>
      </RouteAccessGuard>,
    )
    expect(await screen.findByText('Protected beneficiary record')).toBeTruthy()

    currentRoleState.current.accessRefreshing = true
    view.rerender(
      <RouteAccessGuard>
        <p>Protected beneficiary record</p>
      </RouteAccessGuard>,
    )
    expect(screen.getByLabelText('Loading content')).toBeTruthy()
    expect(screen.queryByText('Protected beneficiary record')).toBeNull()

    let resolveCheck!: (decision: typeof allowedDecision) => void
    requestRouteCheck.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = resolve
      }),
    )
    currentRoleState.current.accessRefreshing = false
    currentRoleState.current.verificationRevision = 2
    view.rerender(
      <RouteAccessGuard>
        <p>Protected beneficiary record</p>
      </RouteAccessGuard>,
    )

    await waitFor(() => expect(requestRouteCheck).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Loading content')).toBeTruthy()
    expect(screen.queryByText('Protected beneficiary record')).toBeNull()
    resolveCheck(allowedDecision)
    expect(await screen.findByText('Protected beneficiary record')).toBeTruthy()
  })

  it('never renders the PIN gate or protected content after backend denial', async () => {
    requestRouteCheck.mockRejectedValueOnce(new RouteCheckErrorMock(403))

    render(
      <RouteAccessGuard>
        <p>Protected beneficiary record</p>
      </RouteAccessGuard>,
    )

    expect(await screen.findByText('Server denied beneficiary access')).toBeTruthy()
    expect(screen.queryByTestId('beneficiary-pin-gate')).toBeNull()
    expect(screen.queryByText('Protected beneficiary record')).toBeNull()
  })
})
