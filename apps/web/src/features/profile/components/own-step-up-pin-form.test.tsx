/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
const group = (name: string) => screen.getByRole('group', { name })
const firstBox = (name: string) =>
  within(group(name)).getByLabelText('Digit 1 of 6') as HTMLInputElement
const fill = (name: string, value: string) =>
  fireEvent.change(firstBox(name), { target: { value } })
const pinValue = (name: string) =>
  Array.from(group(name).querySelectorAll('input'))
    .map((box) => box.value)
    .join('')
const enterCode = (code: string) =>
  code.split('').forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1} of 6`), { target: { value: digit } })
  })
const open = async (name: 'Set PIN' | 'Change PIN') =>
  fireEvent.click(await screen.findByRole('button', { name }))
const reachPinStep = async (name: 'Set PIN' | 'Change PIN' = 'Change PIN') => {
  await open(name)
  enterCode('123456')
  await screen.findByRole('group', { name: 'New PIN' })
}
const reachCurrentPinStep = async () => {
  await open('Change PIN')
  fireEvent.click(screen.getByRole('button', { name: 'Use current PIN' }))
  await screen.findByRole('group', { name: 'Current PIN' })
}
const submitPins = (newPin: string, confirmPin = newPin) => {
  fill('New PIN', newPin)
  fill('Confirm new PIN', confirmPin)
  fireEvent.submit(group('New PIN').closest('form') as HTMLFormElement)
}

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.verify.mockResolvedValue({ fresh: true, method: 'TOTP', pinState: 'NONE' })
  state.set.mockResolvedValue(undefined)
  state.change.mockResolvedValue(undefined)
})

describe('Beneficiary access PIN in My Profile', () => {
  it('shows only a button on the card, as Change password does', async () => {
    state.status.mockResolvedValue(status('NONE'))
    render(<OwnStepUpPinForm />)
    expect(await screen.findByText(/No PIN is set/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Set PIN' })).toBeTruthy()
    expect(document.querySelectorAll('input')).toHaveLength(0)
  })

  it('sets a first PIN only after a fresh authenticator code, then clears the form', async () => {
    state.status.mockResolvedValue(status('NONE'))
    render(<OwnStepUpPinForm />)
    await open('Set PIN')
    expect(screen.queryByRole('group', { name: 'New PIN' })).toBeNull()
    enterCode('123456')
    await screen.findByRole('group', { name: 'New PIN' })
    expect(state.verify).toHaveBeenCalledExactlyOnceWith('123456')
    expect(state.set).not.toHaveBeenCalled()
    for (const name of ['New PIN', 'Confirm new PIN']) {
      const boxes = group(name).querySelectorAll('input')
      expect(boxes).toHaveLength(6)
      for (const box of boxes) {
        expect(box.type).toBe('password')
        expect(box.getAttribute('inputmode')).toBe('numeric')
        expect(box.getAttribute('autocomplete')).toBe('off')
      }
    }
    submitPins('482915')
    expect(await screen.findByText('PIN set.')).toBeTruthy()
    expect(state.set).toHaveBeenCalledExactlyOnceWith('482915')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeTruthy()
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0)
  })

  it('stays on the code step when the authenticator rejects the code', async () => {
    state.status.mockResolvedValue(status('NONE'))
    state.verify.mockRejectedValueOnce(new BeneficiaryStepUpError('rejected', 'rejected'))
    render(<OwnStepUpPinForm />)
    await open('Set PIN')
    enterCode('000000')
    expect(await screen.findByText(/The code was not accepted/)).toBeTruthy()
    const code = firstBox('Authenticator code')
    await waitFor(() => expect(document.activeElement).toBe(code))
    expect(code.getAttribute('aria-invalid')).toBe('true')
    expect(code.getAttribute('aria-describedby')).toBe('own-pin-notice')
    expect(screen.queryByRole('group', { name: 'New PIN' })).toBeNull()
    expect(state.set).not.toHaveBeenCalled()
  })

  it('rejects weak or mismatched PINs without a request', async () => {
    state.status.mockResolvedValue(status('SET'))
    render(<OwnStepUpPinForm />)
    await reachCurrentPinStep()
    fill('Current PIN', '482915')
    submitPins('111111')
    expect(await screen.findAllByText(/simple ascending or descending/)).toHaveLength(2)
    submitPins('529317', '529318')
    expect(await screen.findByText('The new PINs do not match.')).toBeTruthy()
    expect(state.change).not.toHaveBeenCalled()
  })

  it('changes with the current PIN or after an authenticator code', async () => {
    state.status.mockResolvedValue(status('SET'))
    render(<OwnStepUpPinForm />)
    await reachCurrentPinStep()
    expect(state.verify).not.toHaveBeenCalled()
    fill('Current PIN', '482915')
    submitPins('529317')
    expect(await screen.findByText(/PIN changed/)).toBeTruthy()
    expect(state.change).toHaveBeenLastCalledWith('529317', '482915')

    await reachPinStep()
    expect(screen.queryByRole('group', { name: 'Current PIN' })).toBeNull()
    submitPins('640281')
    await waitFor(() => expect(state.change).toHaveBeenLastCalledWith('640281', undefined))
  })

  it('asks for a new code when the authenticator check goes stale before the PIN is sent', async () => {
    state.status.mockResolvedValue(status('SET'))
    state.change.mockRejectedValueOnce(
      new BeneficiaryStepUpError('Verify with your authenticator first.', 'rejected'),
    )
    render(<OwnStepUpPinForm />)
    await reachPinStep()
    submitPins('529317')
    expect(await screen.findByText('Verify with your authenticator first.')).toBeTruthy()
    expect(screen.getByLabelText('Digit 1 of 6')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'New PIN' })).toBeNull()
  })

  it('uses only the authenticator for a locked PIN and reports a lock from the server', async () => {
    state.status.mockResolvedValue(status('LOCKED'))
    render(<OwnStepUpPinForm />)
    expect(await screen.findByText(/Your PIN is locked/)).toBeTruthy()
    await open('Change PIN')
    expect(screen.queryByRole('button', { name: 'Use current PIN' })).toBeNull()

    state.status.mockResolvedValue(status('SET'))
    cleanup()
    state.change.mockRejectedValueOnce(
      new BeneficiaryStepUpError('PIN locked. Use your authenticator to unlock it.', 'locked'),
    )
    render(<OwnStepUpPinForm />)
    await reachCurrentPinStep()
    fill('Current PIN', '736150')
    submitPins('529317')
    expect(await screen.findByText('PIN locked. Use your authenticator to unlock it.')).toBeTruthy()
    expect(screen.getByLabelText('Digit 1 of 6')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Current PIN' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use current PIN' })).toBeNull()
  })

  it('keeps one live region and marks, describes and focuses the invalid field', async () => {
    state.status.mockResolvedValue(status('SET'))
    render(<OwnStepUpPinForm />)
    await reachCurrentPinStep()
    const live = document.getElementById('own-pin-notice') as HTMLElement
    expect(live.getAttribute('aria-live')).toBe('polite')

    fill('Current PIN', '482915')
    submitPins('529317', '529318')
    const confirm = firstBox('Confirm new PIN')
    await waitFor(() => expect(document.activeElement).toBe(confirm))
    expect(confirm.getAttribute('aria-invalid')).toBe('true')
    expect(confirm.getAttribute('aria-describedby')).toBe('own-pin-notice')
    expect(pinValue('Confirm new PIN')).toBe('')
    expect(pinValue('New PIN')).toBe('529317')
    expect(document.getElementById('own-pin-notice')).toBe(live)
    expect(live.textContent).toBe('The new PINs do not match.')

    state.change.mockRejectedValueOnce(new BeneficiaryStepUpError('Incorrect PIN', 'rejected'))
    fill('Confirm new PIN', '529317')
    fireEvent.submit(group('New PIN').closest('form') as HTMLFormElement)
    const current = firstBox('Current PIN')
    await waitFor(() => expect(document.activeElement).toBe(current))
    expect(current.getAttribute('aria-invalid')).toBe('true')
    expect(live.textContent).toBe('Incorrect PIN')
    // A submitted request clears every secret field.
    for (const name of ['Current PIN', 'New PIN', 'Confirm new PIN'])
      expect(pinValue(name)).toBe('')
    expect(confirm.getAttribute('aria-invalid')).toBeNull()
  })

  it('discards what was typed and any message when the dialog is cancelled', async () => {
    state.status.mockResolvedValue(status('SET'))
    render(<OwnStepUpPinForm />)
    await reachCurrentPinStep()
    fill('Current PIN', '482915')
    submitPins('111111')
    await screen.findAllByText(/simple ascending or descending/)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(screen.queryByText(/simple ascending or descending/)).toBeNull()
  })
})
