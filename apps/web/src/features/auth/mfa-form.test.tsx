// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authUserId = '11111111-1111-4111-8111-111111111111'
const session = { access_token: 'synthetic-token', user: { id: authUserId } }
const mfaStatus = {
  authUserId,
  aal: 'aal1',
  enrollmentAllowed: true,
  applicationAccessEnabled: true,
}
const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  enroll: vi.fn(),
  getSession: vi.fn(),
}))
// The browser client is a singleton in the app; a fresh object per render would restart effects.
const client = vi.hoisted(() => ({
  auth: {
    getSession: (...args: unknown[]) => mfa.getSession(...args),
    mfa: {
      listFactors: (...args: unknown[]) => mfa.listFactors(...args),
      enroll: (...args: unknown[]) => mfa.enroll(...args),
    },
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    session,
    status: 'authenticated',
    configured: true,
    refreshSession: vi.fn(),
    signOut: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: 'mfa_required',
    mfaStatus,
    accessError: null,
    accessRefreshing: false,
    refreshAccess: vi.fn(),
    claimWorkspaceHandoff: vi.fn(),
    resetWorkspaceHandoff: vi.fn(),
  }),
}))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => client }))
vi.mock('./auth-access', async (original) => ({
  ...(await original<object>()),
  requestAuthJson: vi.fn(async () => mfaStatus),
}))

import { MfaForm } from './mfa-form'

beforeEach(() => {
  mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null })
  mfa.getSession.mockResolvedValue({ data: { session }, error: null })
  mfa.enroll.mockResolvedValue({
    data: {
      id: '22222222-2222-4222-8222-222222222222',
      totp: {
        qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        secret: 'JBSWY3DPEHPK3PXP',
      },
    },
    error: null,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MfaForm enrollment', () => {
  it('offers the setup key as a manual alternative to the QR code', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))

    expect(await screen.findByAltText('Private authenticator setup QR code')).toBeTruthy()
    const group = screen.getByRole('region', { name: /Can't scan\?/ })
    expect(group.textContent).toContain('Enter a setup key')
    const key = screen.getByText('JBSW Y3DP EHPK 3PXP')
    expect(group.contains(key)).toBe(true)
    expect(key.hasAttribute('aria-labelledby')).toBe(false)
    expect(mfa.enroll).toHaveBeenCalledOnce()
  })

  it('clears the setup key from the page when it is hidden', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByText('JBSW Y3DP EHPK 3PXP')
    fireEvent(window, new Event('pagehide'))
    await waitFor(() => expect(screen.queryByText('JBSW Y3DP EHPK 3PXP')).toBeNull())
    expect(screen.queryByAltText('Private authenticator setup QR code')).toBeNull()
  })

  it('shows no setup key before the explicit enrollment click', async () => {
    render(<MfaForm />)
    await screen.findByRole('button', { name: 'Set up authenticator' })
    expect(screen.queryByText(/Can't scan\?/)).toBeNull()
    expect(mfa.enroll).not.toHaveBeenCalled()
  })
})
