// @vitest-environment jsdom

import type { ReactNode } from 'react'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { routerPush, writeBeneficiaryAccess } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  writeBeneficiaryAccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}))

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

vi.mock('@/hooks/use-prototype-role', () => ({
  usePrototypeRole: () => ({ role: 'M&E' }),
}))

vi.mock('@/lib/auth/beneficiary-step-up', () => ({ writeBeneficiaryAccess }))

import { BeneficiaryAccessGate } from './beneficiary-access-gate'

const originalFetch = globalThis.fetch

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  globalThis.fetch = originalFetch
})

describe('BeneficiaryAccessGate', () => {
  it('retains a safe PIN, restores controls, and permits retry after a rejected request', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ ok: true, expiresAt: '2026-09-03T12:00:00.000Z' }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const onVerified = vi.fn()

    render(<BeneficiaryAccessGate onVerified={onVerified} />)
    const pin = screen.getByRole('textbox', { name: 'Beneficiary access PIN' })
    const verify = screen.getByRole('button', { name: 'Verify and enter' })

    fireEvent.change(pin, { target: { value: '2468' } })
    fireEvent.click(verify)

    expect(
      await screen.findByText(
        'The beneficiary access service could not be reached. Check your connection and try again.',
      ),
    ).toBeTruthy()
    expect((pin as HTMLInputElement).value).toBe('2468')
    expect(verify.hasAttribute('disabled')).toBe(false)

    fireEvent.click(verify)
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(writeBeneficiaryAccess).toHaveBeenCalledWith('M&E', '2026-09-03T12:00:00.000Z')
  })
})
