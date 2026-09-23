// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { requestRouteCheck, RouteCheckErrorMock } = vi.hoisted(() => {
  class RouteCheckErrorMock extends Error {
    failure = 'denied'
    status: number
    constructor(status: number) {
      super('denied')
      this.status = status
    }
  }
  return { requestRouteCheck: vi.fn(), RouteCheckErrorMock }
})

vi.mock('next/navigation', () => ({
  usePathname: () => '/beneficiaries',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ session: { access_token: 'test-token', user: { id: 'user-a' } } }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: 'user-a',
      userId: 'app-user-a',
      organizationId: 'organization-a',
      roles: ['PROJECT_OFFICER'],
      permissions: ['beneficiaries.records.read'],
      assignedProjectIds: ['project-a'],
    },
    refreshAccess: vi.fn(),
    accessRefreshing: false,
    verificationRevision: 1,
    resetWorkspaceHandoff: vi.fn(),
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RouteAccessGuard beneficiary boundary', () => {
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
