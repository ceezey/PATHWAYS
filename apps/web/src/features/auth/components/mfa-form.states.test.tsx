// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authUserId = '33333333-3333-4333-8333-333333333333'
const factorId = '44444444-4444-4444-8444-444444444444'
const otherFactorId = '55555555-5555-4555-8555-555555555555'
const session = { access_token: 'synthetic-token', user: { id: authUserId } }
const status = (aal: string, applicationAccessEnabled = true) => ({
  authUserId,
  aal,
  enrollmentAllowed: true,
  applicationAccessEnabled,
})
const factor = (id: string, state = 'verified', type = 'totp') => ({
  id,
  status: state,
  factor_type: type,
})

const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  getSession: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
}))
const client = vi.hoisted(() => ({
  auth: {
    getSession: (...args: unknown[]) => mfa.getSession(...args),
    mfa: {
      listFactors: (...args: unknown[]) => mfa.listFactors(...args),
      enroll: vi.fn(),
      challenge: (...args: unknown[]) => mfa.challenge(...args),
      verify: (...args: unknown[]) => mfa.verify(...args),
    },
  },
}))
const state = vi.hoisted(() => ({
  session: null as unknown,
  sessionStatus: 'authenticated',
  configured: true,
  mfaStatus: null as unknown,
  freshStatus: null as unknown,
  access: 'mfa_required',
  accessError: null as string | null,
  accessRefreshing: false,
  claim: true,
  replace: vi.fn(),
  signOut: vi.fn(),
  refreshSession: vi.fn(),
  refreshAccess: vi.fn(),
}))
const claimWorkspaceHandoff = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    session: state.session,
    status: state.sessionStatus,
    configured: state.configured,
    refreshSession: state.refreshSession,
    signOut: state.signOut,
  }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: state.access,
    mfaStatus: state.mfaStatus,
    accessError: state.accessError,
    accessRefreshing: state.accessRefreshing,
    refreshAccess: state.refreshAccess,
    claimWorkspaceHandoff,
    profile: null,
  }),
}))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => client }))
vi.mock('@/lib/auth/auth-access', async (original) => ({
  ...(await original<object>()),
  requestAuthJson: vi.fn(async () => state.freshStatus ?? state.mfaStatus),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { MfaForm } from './mfa-form'

beforeEach(() => {
  state.session = session
  state.sessionStatus = 'authenticated'
  state.configured = true
  state.mfaStatus = status('aal1')
  state.freshStatus = null
  state.access = 'mfa_required'
  state.accessError = null
  state.accessRefreshing = false
  claimWorkspaceHandoff.mockReturnValue(true)
  state.signOut.mockResolvedValue(undefined)
  state.refreshSession.mockResolvedValue(undefined)
  mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null })
  mfa.getSession.mockResolvedValue({ data: { session }, error: null })
  mfa.challenge.mockResolvedValue({ data: { id: 'synthetic-challenge' }, error: null })
  mfa.verify.mockResolvedValue({ data: {}, error: { message: 'invalid code' } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const codeBoxes = () => screen.getAllByLabelText(/Digit \d of 6/)
const fillCode = (digits: string) =>
  digits.split('').forEach((digit, index) => {
    fireEvent.change(codeBoxes()[index], { target: { value: digit } })
  })

describe('MfaForm without a usable session', () => {
  it('says the authentication connection is not configured', async () => {
    state.configured = false
    render(<MfaForm />)
    expect(await screen.findByText('The authentication connection is not configured.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull()
  })

  it('asks to sign in first and links back to the staff login without a session', async () => {
    state.session = null
    render(<MfaForm />)
    expect(await screen.findByText('Sign in before setting up MFA.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Login' }).getAttribute('href')).toBe('/staff/login')
  })

  it('shows a disabled code form and Login button while the factor check is running', async () => {
    mfa.listFactors.mockReturnValue(new Promise(() => {}))
    render(<MfaForm />)
    expect(await screen.findByText('Six-digit authenticator code')).toBeTruthy()
    for (const box of codeBoxes()) expect((box as HTMLInputElement).disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Sign out and return to login' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect((screen.getByRole('button', { name: 'Verify' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('reports an invalid factor check without granting access', async () => {
    mfa.listFactors.mockResolvedValue({ data: null, error: { message: 'down' } })
    render(<MfaForm />)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The local API returned an invalid MFA status. Stop and ask for review. No access was granted.',
    )
  })
})

describe('MfaForm factor choices', () => {
  it('uses the existing verified authenticator without offering a new one', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    expect(
      await screen.findByText('Use your existing authenticator. No new factor will be created.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).toBeNull()
    expect(screen.queryByLabelText('Authenticator factor')).toBeNull()
    expect(codeBoxes()).toHaveLength(6)
  })

  it('lets the person pick between several verified authenticators and clears the typed code', async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [factor(factorId), factor(otherFactorId)] },
      error: null,
    })
    render(<MfaForm />)
    const select = (await screen.findByLabelText('Authenticator factor')) as HTMLSelectElement
    expect(select.value).toBe(factorId)
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      `Authenticator 1 (${factorId.slice(0, 8)})`,
      `Authenticator 2 (${otherFactorId.slice(0, 8)})`,
    ])
    fillCode('123')
    fireEvent.change(select, { target: { value: otherFactorId } })
    expect(select.value).toBe(otherFactorId)
    expect(codeBoxes().map((box) => (box as HTMLInputElement).value)).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
    ])
  })

  it('verifies an unfinished setup without replacing the factor', async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [factor(factorId, 'unverified')] },
      error: null,
    })
    render(<MfaForm />)
    expect(await screen.findByText(/An unfinished setup already exists/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).toBeNull()
  })

  it('stops on an unsupported factor type and offers no code form', async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [factor(factorId, 'verified', 'phone')] },
      error: null,
    })
    render(<MfaForm />)
    expect(await screen.findByText(/An unsupported factor exists/)).toBeTruthy()
    expect(screen.queryByLabelText(/Digit \d of 6/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).toBeNull()
  })

  it('verifies the selected factor with the typed code and the challenge it opened', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    mfa.verify.mockResolvedValue({ data: {}, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fillCode('123456')
    await waitFor(() =>
      expect(mfa.verify).toHaveBeenCalledWith({
        factorId,
        challengeId: 'synthetic-challenge',
        code: '123456',
      }),
    )
    expect(state.refreshSession).toHaveBeenCalledOnce()
    expect(state.refreshAccess).toHaveBeenCalledOnce()
  })

  it('does not verify when the fresh API status is no longer aal1', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    state.freshStatus = status('aal2')
    fillCode('123456')
    expect((await screen.findByRole('alert')).textContent).toMatch(/Verification was not accepted/)
    expect(mfa.verify).not.toHaveBeenCalled()
  })

  it.each([
    ['a different user', { access_token: 'synthetic-token', user: { id: otherFactorId } }],
    ['no session', null],
  ])('refuses the factor call when the session shows %s at that moment', async (_name, now) => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    mfa.getSession.mockResolvedValue({ data: { session: now }, error: null })
    fillCode('123456')
    expect((await screen.findByRole('alert')).textContent).toMatch(/Verification was not accepted/)
    expect(mfa.challenge).not.toHaveBeenCalled()
    expect(mfa.verify).not.toHaveBeenCalled()
    expect(state.refreshSession).not.toHaveBeenCalled()
  })

  it('shows the retry guidance after a rejected code', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fillCode('123456')
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Verification was not accepted. Try the next six-digit code. If your session changed, sign in again.',
    )
  })

  it('falls back to the code form after thirty seconds without an aal2 confirmation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    mfa.verify.mockResolvedValue({ data: {}, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fillCode('123456')
    expect(await screen.findByText('Code accepted. Opening your workspace...')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Your code was accepted, but the session could not be confirmed. Reload this page or sign in again.',
    )
  })
})

describe('MfaForm after the API confirms aal2', () => {
  beforeEach(() => {
    state.mfaStatus = status('aal2')
  })

  it('claims the workspace handoff once and opens the landing path', async () => {
    state.access = 'ready'
    render(<MfaForm />)
    expect(await screen.findByText('Opening your dashboard...')).toBeTruthy()
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith('/workspace'))
    expect(claimWorkspaceHandoff).toHaveBeenCalledOnce()
  })

  it('offers a native retry link when the handoff was refused', async () => {
    state.access = 'ready'
    claimWorkspaceHandoff.mockReturnValue(false)
    render(<MfaForm />)
    expect(await screen.findByText(/the workspace could not open/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Retry opening workspace' }).getAttribute('href')).toBe(
      '/workspace',
    )
    expect(state.replace).not.toHaveBeenCalled()
  })

  it('hides the retry link while access is refreshing', async () => {
    state.access = 'ready'
    claimWorkspaceHandoff.mockReturnValue(false)
    const view = render(<MfaForm />)
    expect(await screen.findByRole('link', { name: 'Retry opening workspace' })).toBeTruthy()
    state.accessRefreshing = true
    view.rerender(<MfaForm />)
    expect(screen.getByText('MFA session verified by the API (aal2).')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Retry opening workspace' })).toBeNull()
  })

  it('says application access is unavailable when the profile is not enabled', async () => {
    state.mfaStatus = status('aal2', false)
    render(<MfaForm />)
    expect(await screen.findByText(/Application access is currently unavailable/)).toBeTruthy()
    expect(state.replace).not.toHaveBeenCalled()
  })

  it.each([
    ['loading', 'Finding your authorized workspace...'],
    [
      'no_workspace',
      'No authorized workspace is available. Ask an administrator to review your access, or sign out. Reload this page after access is updated.',
    ],
    [
      'failed',
      'Workspace access is not available. Reload this page or ask the development administrator for help.',
    ],
  ])('explains the %s workspace access state', async (access, message) => {
    state.access = access
    render(<MfaForm />)
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0)
    expect(state.replace).not.toHaveBeenCalled()
  })
})

describe('MfaForm sign out', () => {
  it('signs out and returns to the staff login', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and return to login' }))
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith('/staff/login'))
    expect(state.signOut).toHaveBeenCalledOnce()
  })

  it('keeps the sign-out card without the no-session text while the sign-out completes', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    let finish: () => void = () => {}
    const view = render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    state.signOut.mockImplementation(() => {
      state.session = null
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and return to login' }))
    await waitFor(() => expect(state.signOut).toHaveBeenCalledOnce())
    view.rerender(<MfaForm />)
    expect(screen.queryByText('Sign in before setting up MFA.')).toBeNull()
    const button = screen.getByRole('button', { name: 'Sign out and return to login' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(state.replace).not.toHaveBeenCalled()
    await act(async () => finish())
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith('/staff/login'))
  })

  it('stays on the page with a warning when the sign-out cannot be confirmed', async () => {
    state.signOut.mockRejectedValue(new Error('offline'))
    mfa.listFactors.mockResolvedValue({ data: { all: [factor(factorId)] }, error: null })
    render(<MfaForm />)
    await screen.findByLabelText('Digit 1 of 6')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and return to login' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Sign-out could not be confirmed. Close this private browser window before continuing.',
    )
    expect(state.replace).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/Digit \d of 6/)).toBeNull()
  })
})
