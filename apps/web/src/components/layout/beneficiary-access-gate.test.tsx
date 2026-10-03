// @vitest-environment jsdom

import type { ReactNode } from 'react'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getStatus: vi.fn(),
  verify: vi.fn(),
  verifyPin: vi.fn(),
  setPin: vi.fn(),
  unlock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.routerPush }) }))
vi.mock('@/components/pathways/dialog-shell', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <section>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}))
vi.mock('@/components/ui/dialog', () => ({
  // Exposes the Radix dismissal path (Escape, overlay or close control) as a button.
  Dialog: ({
    children,
    onOpenChange,
  }: { children: ReactNode; onOpenChange?: (open: boolean) => void }) => (
    <div>
      <button type="button" onClick={() => onOpenChange?.(false)}>
        Dismiss dialog
      </button>
      {children}
    </div>
  ),
}))
vi.mock('@/lib/auth/beneficiary-step-up', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/beneficiary-step-up')>(
    '@/lib/auth/beneficiary-step-up',
  )
  return {
    ...actual,
    getBeneficiaryStepUpStatus: mocks.getStatus,
    verifyBeneficiaryStepUp: mocks.verify,
    verifyStepUpPin: mocks.verifyPin,
    setStepUpPin: mocks.setPin,
    unlockStepUpPin: mocks.unlock,
  }
})

import { BeneficiaryStepUpError } from '@/lib/auth/beneficiary-step-up'
import { STEP_UP_REQUIRED_EVENT } from '@/lib/auth/beneficiary-step-up-events'
import { BeneficiaryAccessGate } from './beneficiary-access-gate'

const content = <p>Scoped beneficiary content</p>
const codeInput = () => screen.getByRole('textbox', { name: 'Digit 1 of 6' })
const enteredCode = () =>
  screen
    .getAllByRole('textbox', { name: /^Digit \d of 6$/ })
    .map((box) => (box as HTMLInputElement).value)
    .join('')
const verifyButton = () => screen.getByRole('button', { name: 'Verify' })

const stale = (pinState: 'NONE' | 'SET' | 'LOCKED' = 'SET') => ({
  fresh: false,
  expiresAt: null,
  method: null,
  pinState,
})
const totpFresh = (pinState: 'NONE' | 'SET' | 'LOCKED' = 'SET') => ({
  fresh: true,
  expiresAt: '2026-09-28T00:15:00.000Z',
  method: 'TOTP',
  pinState,
})

beforeEach(() => {
  mocks.getStatus.mockResolvedValue(stale())
  mocks.verify.mockResolvedValue(totpFresh())
  mocks.verifyPin.mockResolvedValue({ ...totpFresh(), method: 'PIN' })
  mocks.setPin.mockResolvedValue(undefined)
  mocks.unlock.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
})

describe('BeneficiaryAccessGate (server-verified step-up)', () => {
  it('renders Beneficiary content directly when the server reports a fresh step-up', async () => {
    mocks.getStatus.mockResolvedValue(totpFresh())
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(screen.queryByText('Verify beneficiary module access')).toBeNull()
  })

  it('keeps details hidden until the server accepts a re-verified authenticator code', async () => {
    mocks.verify.mockRejectedValueOnce(new BeneficiaryStepUpError('no', 'rejected'))
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    expect(await screen.findByText('Verify beneficiary module access')).toBeTruthy()
    expect(screen.queryByText(/2468|temporary PIN/i)).toBeNull()
    expect((verifyButton() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(codeInput(), { target: { value: '000000' } })
    fireEvent.click(verifyButton())
    expect(await screen.findByText(/The code was not accepted/)).toBeTruthy()
    expect(screen.queryByText('Scoped beneficiary content')).toBeNull()
    await waitFor(() => expect(enteredCode()).toBe(''))
    await waitFor(() => expect(document.activeElement).toBe(codeInput()))

    fireEvent.change(codeInput(), { target: { value: '12a34567' } })
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.verify).toHaveBeenLastCalledWith('123456')
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.length).toBe(0)
  })

  it('reports a verification outage without revealing content or clearing the code', async () => {
    mocks.verify.mockRejectedValueOnce(new BeneficiaryStepUpError('down', 'unavailable'))
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    fireEvent.click(verifyButton())
    expect(await screen.findByText(/could not be reached/)).toBeTruthy()
    expect(enteredCode()).toBe('123456')
    await waitFor(() => expect(document.activeElement).toBe(verifyButton()))
    expect(screen.queryByText('Scoped beneficiary content')).toBeNull()
  })

  it('fails closed when step-up status is unavailable and can retry', async () => {
    mocks.getStatus.mockRejectedValueOnce(new Error('outage'))
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    expect(await screen.findByText('Beneficiary verification unavailable')).toBeTruthy()
    expect(screen.queryByText('Scoped beneficiary content')).toBeNull()
    mocks.getStatus.mockResolvedValueOnce(totpFresh())
    fireEvent.click(screen.getByRole('button', { name: 'Retry verification check' }))
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
  })

  it('auto-verifies once all six digits are entered, without a button click', async () => {
    mocks.getStatus.mockResolvedValue(stale('SET'))
    mocks.verify.mockResolvedValue(totpFresh('SET'))
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.verify).toHaveBeenCalledOnce()
    expect(mocks.verify).toHaveBeenCalledWith('123456')
  })

  it('returns to the dashboard when a blocking prompt is dismissed', async () => {
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    fireEvent.click(await screen.findByRole('button', { name: 'Dashboard' }))
    expect(mocks.routerPush).toHaveBeenCalledWith('/dashboard')
  })

  it('outside Beneficiary routes prompts only when the API reports STEP_UP_REQUIRED', async () => {
    render(<BeneficiaryAccessGate preflight={false}>{content}</BeneficiaryAccessGate>)
    expect(screen.getByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.getStatus).not.toHaveBeenCalled()
    expect(screen.queryByText('Verify beneficiary module access')).toBeNull()

    act(() => {
      window.dispatchEvent(new Event(STEP_UP_REQUIRED_EVENT))
    })
    expect(screen.getByText('Verify beneficiary module access')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText('Verify beneficiary module access')).toBeNull()
    expect(mocks.routerPush).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event(STEP_UP_REQUIRED_EVENT))
    })
    fireEvent.change(codeInput(), { target: { value: '123456' } })
    fireEvent.click(verifyButton())
    await waitFor(() => expect(screen.queryByText('Verify beneficiary module access')).toBeNull())
    expect(screen.getByText('Scoped beneficiary content')).toBeTruthy()
  })
})

describe('BeneficiaryAccessGate (STEP_UP_PIN_UI_ENABLED false)', () => {
  it('never offers "Use PIN" or "Set a PIN", and TOTP still works', async () => {
    mocks.getStatus.mockResolvedValue(stale('SET'))
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    expect(await screen.findByText('Verify beneficiary module access')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use PIN' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use authenticator' })).toBeNull()
    expect(screen.queryByText('PIN locked. Use your authenticator to unlock it.')).toBeNull()

    fireEvent.change(codeInput(), { target: { value: '123456' } })
    fireEvent.click(verifyButton())
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(screen.queryByText('Set a beneficiary access PIN')).toBeNull()
  })

  it('never offers "Set a PIN" after a TOTP step-up even when no PIN exists', async () => {
    mocks.getStatus.mockResolvedValue(stale('NONE'))
    mocks.verify.mockResolvedValue(totpFresh('NONE'))
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    fireEvent.click(verifyButton())
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(screen.queryByText('Set a beneficiary access PIN')).toBeNull()
    expect(mocks.setPin).not.toHaveBeenCalled()
  })
})

// The PIN fallback UI is hidden behind STEP_UP_PIN_UI_ENABLED (see
// apps/web/src/constants/feature-flags.ts and docs/deferred-features.md). These tests
// exercise the same gate with the flag forced on, so the underlying PIN behaviour the
// API still enforces stays covered while the flag is off in the running app.
describe('BeneficiaryAccessGate PIN fallback (cr-pathways-beneficiary-step-up-pin, flag on)', () => {
  let EnabledGate: typeof import('./beneficiary-access-gate').BeneficiaryAccessGate

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({ STEP_UP_PIN_UI_ENABLED: true }))
    ;({ BeneficiaryAccessGate: EnabledGate } = await import('./beneficiary-access-gate'))
  })

  afterEach(() => {
    vi.doUnmock('@/constants/feature-flags')
  })

  const renderGate = (props: { preflight: boolean }) =>
    render(<EnabledGate preflight={props.preflight}>{content}</EnabledGate>)

  const pinInput = () => screen.getByLabelText('Beneficiary access PIN') as HTMLInputElement
  const usePin = () => screen.queryByRole('button', { name: 'Use PIN' })

  it.each([
    ['NONE', false],
    ['LOCKED', false],
    ['SET', true],
  ] as const)('offers "Use PIN" for pinState %s: %s', async (pinState, offered) => {
    mocks.getStatus.mockResolvedValue(stale(pinState))
    renderGate({ preflight: true })
    expect(await screen.findByText('Verify beneficiary module access')).toBeTruthy()
    expect(usePin() !== null).toBe(offered)
    if (pinState === 'LOCKED')
      expect(screen.getByText('PIN locked. Use your authenticator to unlock it.')).toBeTruthy()
  })

  it('verifies a PIN, clears it after each attempt and never stores it', async () => {
    mocks.verifyPin.mockRejectedValueOnce(new BeneficiaryStepUpError('Incorrect PIN', 'rejected'))
    renderGate({ preflight: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Use PIN' }))
    expect(screen.getByRole('button', { name: 'Use PIN' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    const input = pinInput()
    expect(input.type).toBe('password')
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(document.activeElement).toBe(input)

    fireEvent.change(input, { target: { value: '73a6150' } })
    expect(pinInput().value).toBe('736150')
    fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }))
    expect(await screen.findByText('Incorrect PIN. Personal details remain hidden.')).toBeTruthy()
    expect(pinInput().value).toBe('')
    expect(document.activeElement).toBe(pinInput())
    expect(screen.queryByText('Scoped beneficiary content')).toBeNull()

    fireEvent.change(pinInput(), { target: { value: '482915' } })
    fireEvent.keyDown(pinInput(), { key: 'Enter' })
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.verifyPin).toHaveBeenLastCalledWith('482915')
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.length).toBe(0)
  })

  it('directs a locked PIN to the authenticator', async () => {
    mocks.verifyPin.mockRejectedValueOnce(
      new BeneficiaryStepUpError('PIN locked. Use your authenticator to unlock it.', 'locked'),
    )
    renderGate({ preflight: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Use PIN' }))
    fireEvent.change(pinInput(), { target: { value: '736150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }))
    await waitFor(() => expect(codeInput()).toBeTruthy())
    expect(
      screen.getAllByText('PIN locked. Use your authenticator to unlock it.').length,
    ).toBeGreaterThan(0)
    expect(usePin()).toBeNull()
    expect(document.activeElement).toBe(codeInput())
  })

  it('unlocks a locked PIN after a successful authenticator step-up', async () => {
    mocks.getStatus.mockResolvedValue(stale('LOCKED'))
    mocks.verify.mockResolvedValue(totpFresh('LOCKED'))
    renderGate({ preflight: true })
    fireEvent.change(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    fireEvent.click(verifyButton())
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.unlock).toHaveBeenCalledOnce()
  })

  it('offers a skippable "Set a PIN" after a TOTP step-up when no PIN exists', async () => {
    mocks.getStatus.mockResolvedValue(stale('NONE'))
    mocks.verify.mockResolvedValue(totpFresh('NONE'))
    renderGate({ preflight: true })
    fireEvent.change(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    fireEvent.click(verifyButton())
    expect(await screen.findByText('Set a beneficiary access PIN')).toBeTruthy()
    expect(screen.queryByText('Scoped beneficiary content')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.setPin).not.toHaveBeenCalled()
  })

  it('validates and saves a new PIN from the offer, clearing both fields', async () => {
    mocks.getStatus.mockResolvedValue(stale('NONE'))
    mocks.verify.mockResolvedValue(totpFresh('NONE'))
    renderGate({ preflight: true })
    fireEvent.change(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    fireEvent.click(verifyButton())
    const newPin = (await screen.findByLabelText('New PIN')) as HTMLInputElement
    const confirm = screen.getByLabelText('Confirm new PIN') as HTMLInputElement
    expect(newPin.type).toBe('password')
    expect(confirm.getAttribute('autocomplete')).toBe('off')

    fireEvent.change(newPin, { target: { value: '123456' } })
    fireEvent.change(confirm, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/simple ascending or descending/),
    )
    expect((screen.getByLabelText('New PIN') as HTMLInputElement).value).toBe('')
    expect(mocks.setPin).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '482915' } })
    fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: '482916' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }))
    expect(await screen.findByText('The PINs do not match. Enter them again.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '482915' } })
    fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: '482915' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }))
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.setPin).toHaveBeenCalledExactlyOnceWith('482915')
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.length).toBe(0)
  })

  it('treats dismissing the "Set a PIN" offer as skip: content opens, no navigation', async () => {
    mocks.getStatus.mockResolvedValue(stale('NONE'))
    mocks.verify.mockResolvedValue(totpFresh('NONE'))
    renderGate({ preflight: true })
    fireEvent.change(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    fireEvent.click(verifyButton())
    expect(await screen.findByText('Set a beneficiary access PIN')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss dialog' }))
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.routerPush).not.toHaveBeenCalled()
    expect(mocks.setPin).not.toHaveBeenCalled()
  })

  it('still leaves to the dashboard when the blocking verification prompt is dismissed', async () => {
    renderGate({ preflight: true })
    await screen.findByText('Verify beneficiary module access')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss dialog' }))
    expect(mocks.routerPush).toHaveBeenCalledWith('/dashboard')
  })

  it('moves Enter in New PIN to the empty confirmation instead of submitting', async () => {
    mocks.getStatus.mockResolvedValue(stale('NONE'))
    mocks.verify.mockResolvedValue(totpFresh('NONE'))
    renderGate({ preflight: true })
    fireEvent.change(await screen.findByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    fireEvent.click(verifyButton())
    const newPin = (await screen.findByLabelText('New PIN')) as HTMLInputElement
    fireEvent.change(newPin, { target: { value: '482915' } })
    fireEvent.keyDown(newPin, { key: 'Enter' })
    expect(document.activeElement).toBe(screen.getByLabelText('Confirm new PIN'))
    expect((screen.getByLabelText('New PIN') as HTMLInputElement).value).toBe('482915')
    expect(screen.queryByText('The PINs do not match. Enter them again.')).toBeNull()
    fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: '482915' } })
    fireEvent.keyDown(screen.getByLabelText('Confirm new PIN'), { key: 'Enter' })
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.setPin).toHaveBeenCalledExactlyOnceWith('482915')
  })

  it('returns to the authenticator when the PIN status cannot be refreshed', async () => {
    renderGate({ preflight: false })
    act(() => {
      window.dispatchEvent(new Event(STEP_UP_REQUIRED_EVENT))
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Use PIN' }))
    let fail!: (error: Error) => void
    mocks.getStatus.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject
      }),
    )
    act(() => {
      window.dispatchEvent(new Event(STEP_UP_REQUIRED_EVENT))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN' }))
    expect(screen.getByLabelText('Beneficiary access PIN')).toBeTruthy()
    await act(async () => fail(new Error('outage')))
    expect(screen.queryByRole('button', { name: 'Use PIN' })).toBeNull()
    expect(codeInput()).toBeTruthy()
    expect(screen.queryByLabelText('Beneficiary access PIN')).toBeNull()
  })
})
