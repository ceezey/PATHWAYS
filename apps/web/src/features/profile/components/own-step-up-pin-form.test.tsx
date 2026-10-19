/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  status: vi.fn(),
  verify: vi.fn(),
  set: vi.fn(),
  change: vi.fn(),
}))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ session: { user: { id: 'synthetic-a' } } }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: { id: 'synthetic-a', userId: 'user-a', organizationId: 'org-a' },
    access: 'ready',
  }),
}))
vi.mock('@/lib/auth/beneficiary-step-up', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/beneficiary-step-up')>(
    '@/lib/auth/beneficiary-step-up',
  )
  return {
    ...actual,
    getBeneficiaryStepUpStatus: state.status,
    verifyBeneficiaryStepUp: state.verify,
    setStepUpPin: state.set,
    changeStepUpPin: state.change,
  }
})

import { BeneficiaryStepUpError } from '@/lib/auth/beneficiary-step-up'
import { OwnStepUpPinForm } from './own-step-up-pin-form'

const status = (pinState: 'NONE' | 'SET' | 'LOCKED') => ({
  fresh: false,
  expiresAt: null,
  method: null,
  pinState,
})
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const values = () =>
  Array.from(document.querySelectorAll('input:not([type=radio])')).map(
    (input) => (input as HTMLInputElement).value,
  )

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.verify.mockResolvedValue({ fresh: true, method: 'TOTP', pinState: 'NONE' })
  state.set.mockResolvedValue(undefined)
  state.change.mockResolvedValue(undefined)
})

describe('Beneficiary access PIN in My Profile', () => {
  it('sets a first PIN only after a fresh authenticator code, then clears the form', async () => {
    state.status.mockResolvedValue(status('NONE'))
    render(<OwnStepUpPinForm />)
    expect(await screen.findByText(/No PIN is set/)).toBeTruthy()
    for (const label of ['New PIN', 'Confirm new PIN']) {
      const input = screen.getByLabelText(label) as HTMLInputElement
      expect(input.type).toBe('password')
      expect(input.getAttribute('inputmode')).toBe('numeric')
      expect(input.getAttribute('autocomplete')).toBe('off')
    }
    expect(screen.getByLabelText('Authenticator code').getAttribute('autocomplete')).toBe(
      'one-time-code',
    )
    fill('Authenticator code', '123456')
    fill('New PIN', '482915')
    fill('Confirm new PIN', '482915')
    fireEvent.click(screen.getByRole('button', { name: 'Set PIN' }))
    expect(await screen.findByText('PIN set.')).toBeTruthy()
    expect(state.verify).toHaveBeenCalledExactlyOnceWith('123456')
    expect(state.set).toHaveBeenCalledExactlyOnceWith('482915')
    expect(state.verify.mock.invocationCallOrder[0]).toBeLessThan(
      state.set.mock.invocationCallOrder[0] ?? 0,
    )
    await waitFor(() => expect(values().every((value) => value === '')).toBe(true))
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0)
  })

  it('rejects weak or mismatched PINs without a request', async () => {
    state.status.mockResolvedValue(status('SET'))
    render(<OwnStepUpPinForm />)
    await screen.findByLabelText('Current PIN')
    fill('Current PIN', '482915')
    fill('New PIN', '111111')
    fill('Confirm new PIN', '111111')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(await screen.findAllByText(/simple ascending or descending/)).toHaveLength(2)
    fill('Current PIN', '482915')
    fill('New PIN', '529317')
    fill('Confirm new PIN', '529318')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(await screen.findByText('The new PINs do not match.')).toBeTruthy()
    expect(state.change).not.toHaveBeenCalled()
  })

  it('changes with the current PIN or an authenticator code', async () => {
    state.status.mockResolvedValue(status('SET'))
    render(<OwnStepUpPinForm />)
    await screen.findByLabelText('Current PIN')
    fill('Current PIN', '482915')
    fill('New PIN', '529317')
    fill('Confirm new PIN', '529317')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(await screen.findByText(/PIN changed/)).toBeTruthy()
    expect(state.change).toHaveBeenLastCalledWith('529317', { currentPin: '482915' })

    fireEvent.click(screen.getByRole('radio', { name: 'Use authenticator code' }))
    fill('Authenticator code', '654321')
    fill('New PIN', '640281')
    fill('Confirm new PIN', '640281')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    await waitFor(() =>
      expect(state.change).toHaveBeenLastCalledWith('640281', { authenticatorCode: '654321' }),
    )
  })

  it('uses only the authenticator for a locked PIN and reports a lock from the server', async () => {
    state.status.mockResolvedValue(status('LOCKED'))
    render(<OwnStepUpPinForm />)
    expect(await screen.findByText(/Your PIN is locked/)).toBeTruthy()
    expect(screen.queryByLabelText('Current PIN')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()

    state.status.mockResolvedValue(status('SET'))
    cleanup()
    state.change.mockRejectedValueOnce(
      new BeneficiaryStepUpError('PIN locked. Use your authenticator to unlock it.', 'locked'),
    )
    render(<OwnStepUpPinForm />)
    await screen.findByLabelText('Current PIN')
    fill('Current PIN', '736150')
    fill('New PIN', '529317')
    fill('Confirm new PIN', '529317')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(await screen.findByText('PIN locked. Use your authenticator to unlock it.')).toBeTruthy()
    expect(screen.getByLabelText('Authenticator code')).toBeTruthy()
    expect(screen.queryByLabelText('Current PIN')).toBeNull()
  })

  it('keeps one live region and marks, describes and focuses the invalid field', async () => {
    state.status.mockResolvedValue(status('SET'))
    render(<OwnStepUpPinForm />)
    const live = screen.getByRole('status')
    expect(live.getAttribute('aria-live')).toBe('polite')
    await screen.findByLabelText('Current PIN')
    expect(screen.getByRole('status')).toBe(live)

    fill('Current PIN', '482915')
    fill('New PIN', '529317')
    fill('Confirm new PIN', '529318')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    const confirm = screen.getByLabelText('Confirm new PIN') as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(confirm))
    expect(confirm.getAttribute('aria-invalid')).toBe('true')
    expect(confirm.getAttribute('aria-describedby')).toBe('own-pin-notice')
    expect(confirm.value).toBe('')
    expect((screen.getByLabelText('New PIN') as HTMLInputElement).value).toBe('529317')
    expect(screen.getByRole('status')).toBe(live)
    expect(live.textContent).toBe('The new PINs do not match.')

    fill('Confirm new PIN', '529317')
    state.change.mockRejectedValueOnce(new BeneficiaryStepUpError('Incorrect PIN', 'rejected'))
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    const current = screen.getByLabelText('Current PIN') as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(current))
    expect(current.getAttribute('aria-invalid')).toBe('true')
    expect(live.textContent).toBe('Incorrect PIN')
    // A submitted request clears every secret field.
    expect(values().every((value) => value === '')).toBe(true)
    expect(confirm.getAttribute('aria-invalid')).toBeNull()
  })

  it('gives the proof choices a 44px hit area', async () => {
    state.status.mockResolvedValue(status('SET'))
    render(<OwnStepUpPinForm />)
    for (const name of ['Use current PIN', 'Use authenticator code']) {
      const radio = await screen.findByRole('radio', { name })
      expect(radio.closest('label')?.className).toContain('min-h-11')
    }
  })
})
