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
  usePrototypeRole: () => ({ role: 'Monitoring and Evaluation Officer' }),
}))

vi.mock('@/lib/auth/beneficiary-step-up', () => ({ writeBeneficiaryAccess }))

import { BeneficiaryAccessGate } from './beneficiary-access-gate'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BeneficiaryAccessGate', () => {
  it('keeps details hidden after a wrong local PIN and permits retry with the fictional PIN', async () => {
    const onVerified = vi.fn()

    render(<BeneficiaryAccessGate onVerified={onVerified} />)
    const pin = screen.getByRole('textbox', { name: 'Beneficiary access PIN' })
    const verify = screen.getByRole('button', { name: 'Verify and enter' })

    fireEvent.change(pin, { target: { value: '9999' } })
    fireEvent.click(verify)

    expect(
      await screen.findByText(
        'The PIN is incorrect. Personal details remain hidden; try the fictional demo PIN shown below.',
      ),
    ).toBeTruthy()
    expect((pin as HTMLInputElement).value).toBe('')
    fireEvent.change(pin, { target: { value: '2468' } })

    fireEvent.click(verify)
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1))
    expect(writeBeneficiaryAccess).toHaveBeenCalledWith('Monitoring and Evaluation Officer')
  })
})
