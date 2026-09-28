// @vitest-environment jsdom

import type { ReactNode } from 'react'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getStatus: vi.fn(),
  verify: vi.fn(),
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
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/lib/auth/beneficiary-step-up', () => {
  class BeneficiaryStepUpError extends Error {
    constructor(
      message: string,
      readonly failure: 'rejected' | 'unavailable',
    ) {
      super(message)
    }
  }
  return {
    BeneficiaryStepUpError,
    getBeneficiaryStepUpStatus: mocks.getStatus,
    verifyBeneficiaryStepUp: mocks.verify,
  }
})

import { BeneficiaryStepUpError } from '@/lib/auth/beneficiary-step-up'
import { STEP_UP_REQUIRED_EVENT } from '@/lib/auth/beneficiary-step-up-events'
import { BeneficiaryAccessGate } from './beneficiary-access-gate'

const content = <p>Scoped beneficiary content</p>
const codeInput = () => screen.getByRole('textbox', { name: 'Authenticator code' })
const verifyButton = () => screen.getByRole('button', { name: 'Verify and enter' })

beforeEach(() => {
  mocks.getStatus.mockResolvedValue({ fresh: false, expiresAt: null })
  mocks.verify.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
})

describe('BeneficiaryAccessGate (server-verified step-up)', () => {
  it('renders Beneficiary content directly when the server reports a fresh step-up', async () => {
    mocks.getStatus.mockResolvedValue({ fresh: true, expiresAt: '2026-09-28T00:15:00.000Z' })
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
    expect((codeInput() as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(codeInput())

    fireEvent.change(codeInput(), { target: { value: '12a34567' } })
    expect((codeInput() as HTMLInputElement).value).toBe('123456')
    fireEvent.click(verifyButton())
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
    expect(mocks.verify).toHaveBeenLastCalledWith('123456')
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.length).toBe(0)
  })

  it('reports a verification outage without revealing content or clearing the code', async () => {
    mocks.verify.mockRejectedValueOnce(new BeneficiaryStepUpError('down', 'unavailable'))
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Authenticator code' }), {
      target: { value: '123456' },
    })
    fireEvent.click(verifyButton())
    expect(await screen.findByText(/could not be reached/)).toBeTruthy()
    expect((codeInput() as HTMLInputElement).value).toBe('123456')
    await waitFor(() => expect(document.activeElement).toBe(verifyButton()))
    expect(screen.queryByText('Scoped beneficiary content')).toBeNull()
  })

  it('fails closed when step-up status is unavailable and can retry', async () => {
    mocks.getStatus.mockRejectedValueOnce(new Error('outage'))
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    expect(await screen.findByText('Beneficiary verification unavailable')).toBeTruthy()
    expect(screen.queryByText('Scoped beneficiary content')).toBeNull()
    mocks.getStatus.mockResolvedValueOnce({ fresh: true, expiresAt: '2026-09-28T00:15:00.000Z' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry verification check' }))
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
  })

  it('returns to the dashboard when a blocking prompt is dismissed', async () => {
    render(<BeneficiaryAccessGate preflight>{content}</BeneficiaryAccessGate>)
    fireEvent.click(await screen.findByRole('button', { name: 'Back to dashboard' }))
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
