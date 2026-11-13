/* @vitest-environment jsdom */
import { PathwaysClientError } from '@/lib/api/core/request'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  signOut: vi.fn(),
  verify: vi.fn(),
  update: vi.fn(),
  change: vi.fn(),
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
vi.mock('@/lib/api/profile', () => ({
  ownProfileClient: { read: vi.fn().mockResolvedValue({}), changePassword: state.change },
}))
vi.mock('../own-password-operation', async () => {
  const actual = await vi.importActual<typeof import('../own-password-operation')>(
    '../own-password-operation',
  )
  const user = { data: { user: { id: 'synthetic-a' } }, error: null }
  return {
    ...actual,
    bindPasswordSession: vi.fn().mockResolvedValue(undefined),
    createPasswordAuthClient: () => ({
      auth: {
        getUser: async () => user,
        getSession: async () => ({
          data: { session: { access_token: 'verified-token' } },
          error: null,
        }),
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
  state.change.mockResolvedValue(undefined)
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
    expect(state.change).not.toHaveBeenCalled()
  })

  it('changes the password through the API with the verified token, then signs out', async () => {
    await reachPasswordStep()
    fillPasswords(GOOD, GOOD)
    await waitFor(() => expect(state.signOut).toHaveBeenCalledTimes(1))
    expect(state.change).toHaveBeenCalledWith(GOOD, 'verified-token', expect.any(Function))
    expect(state.update).not.toHaveBeenCalled()
    expect(await screen.findByText(/Password changed/)).toBeTruthy()
  })

  it.each([
    [403, 'Verify your authenticator again, then choose a new password.'],
    [400, 'The password was not changed. Choose a different password.'],
  ])('a %s is a definite refusal that allows a retry', async (status, text) => {
    state.change.mockRejectedValue(
      new PathwaysClientError('x', status === 403 ? 'forbidden' : 'invalid', [], status),
    )
    await reachPasswordStep()
    fillPasswords(GOOD, GOOD)
    expect(await screen.findByText(text)).toBeTruthy()
    expect(screen.queryByText(/could not be confirmed/)).toBeNull()
    expect(state.signOut).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Change password' })).not.toHaveProperty(
      'disabled',
      true,
    )
  })

  it('a 503 or network failure is uncertain and blocks retries', async () => {
    state.change.mockRejectedValue(new PathwaysClientError('x', 'network', [], 503))
    await reachPasswordStep()
    fillPasswords(GOOD, GOOD)
    expect(await screen.findByText(/could not be confirmed/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change password' })).toHaveProperty('disabled', true)
  })
})
