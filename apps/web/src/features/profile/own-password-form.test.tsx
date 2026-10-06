/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  signOut: vi.fn(),
  verify: vi.fn(),
  update: vi.fn(),
  reauthenticate: vi.fn(),
}))
const session = { user: { id: 'synthetic-a' } }
const role = {
  profile: {
    userId: 'user-a',
    organizationId: 'org-a',
    roles: ['MANAGER'],
    permissions: ['profile.manage'],
  },
  access: 'ready',
}
vi.mock('@/hooks/use-session', () => ({ useSession: () => ({ session, signOut: state.signOut }) }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => role }))
vi.mock('@/lib/services/own-profile-client', () => ({
  ownProfileClient: { read: vi.fn().mockResolvedValue({}) },
}))
vi.mock('./own-password-operation', async () => {
  const actual = await vi.importActual<typeof import('./own-password-operation')>(
    './own-password-operation',
  )
  const user = { data: { user: { id: 'synthetic-a' } }, error: null }
  return {
    ...actual,
    bindPasswordSession: vi.fn().mockResolvedValue(undefined),
    createPasswordAuthClient: () => ({
      auth: {
        getUser: async () => user,
        reauthenticate: state.reauthenticate,
        mfa: {
          listFactors: async () => ({ data: { totp: [{ id: 'f1', status: 'verified' }] } }),
          challengeAndVerify: state.verify,
        },
        updateUser: state.update,
      },
    }),
  }
})

import { OwnPasswordForm } from './own-password-form'

const GOOD = 'Str0ng!Passw0rd#1'
const enterCode = (code: string) =>
  code.split('').forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1} of 6`), { target: { value: digit } })
  })
const reachPasswordStep = async () => {
  render(<OwnPasswordForm />)
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
  enterCode('123456')
  await screen.findByLabelText('New password')
}
const fillPasswords = (password: string, confirm: string) => {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
  fireEvent.submit(screen.getByLabelText('New password').closest('form') as HTMLFormElement)
}

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.verify.mockResolvedValue({ error: null })
  state.update.mockResolvedValue({ error: null })
  state.signOut.mockResolvedValue(undefined)
})

describe('Change password step-up modal', () => {
  it('opens the authenticator modal from a single button without sending a nonce', () => {
    render(<OwnPasswordForm />)
    expect(screen.queryByLabelText('Digit 1 of 6')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByText('Verify your authenticator')).toBeTruthy()
    expect(state.reauthenticate).not.toHaveBeenCalled()
  })

  it('keeps the user on the code step when the code is wrong', async () => {
    state.verify.mockResolvedValue({ error: new Error('bad') })
    render(<OwnPasswordForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    enterCode('123456')
    expect(await screen.findByText(/code was not accepted/)).toBeTruthy()
    expect(screen.getByText('Verify your authenticator')).toBeTruthy()
    expect(screen.queryByLabelText('New password')).toBeNull()
  })

  it('advances to the password step after a verified code', async () => {
    await reachPasswordStep()
    expect(state.verify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
    expect(screen.getByLabelText('Confirm new password')).toBeTruthy()
  })

  it('blocks submit when the passwords do not match', async () => {
    await reachPasswordStep()
    fillPasswords(GOOD, `${GOOD}x`)
    expect(await screen.findByText('Passwords do not match.')).toBeTruthy()
    expect(state.update).not.toHaveBeenCalled()
  })

  it('shows the sign-in-again message on reauthentication_needed without locking', async () => {
    state.update.mockResolvedValue({ error: { code: 'reauthentication_needed', status: 401 } })
    await reachPasswordStep()
    fillPasswords(GOOD, GOOD)
    expect(await screen.findByText(/sign out and sign in again/)).toBeTruthy()
    expect(screen.queryByText(/could not be confirmed/)).toBeNull()
    expect(state.signOut).not.toHaveBeenCalled()
    expect(
      (screen.getByRole('button', { name: 'Change password' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('treats other update errors as uncertain and blocks retries', async () => {
    state.update.mockResolvedValue({ error: { code: 'unexpected_failure', status: 500 } })
    await reachPasswordStep()
    fillPasswords(GOOD, GOOD)
    expect(await screen.findByText(/could not be confirmed/)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Change password' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('updates the password and signs out on success', async () => {
    await reachPasswordStep()
    fillPasswords(GOOD, GOOD)
    await waitFor(() => expect(state.signOut).toHaveBeenCalledTimes(1))
    expect(state.update).toHaveBeenCalledWith({ password: GOOD })
    expect(await screen.findByText(/Password changed/)).toBeTruthy()
  })
})
