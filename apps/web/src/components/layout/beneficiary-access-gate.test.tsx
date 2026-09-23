// @vitest-environment jsdom

import type { ReactNode } from 'react'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))

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

import { BeneficiaryAccessGate } from './beneficiary-access-gate'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BeneficiaryAccessGate', () => {
  it('keeps details hidden for an incorrect PIN and reveals them after the accepted PIN', async () => {
    render(
      <BeneficiaryAccessGate>
        <p>Scoped beneficiary content</p>
      </BeneficiaryAccessGate>,
    )
    const pin = screen.getByRole('textbox', { name: 'Beneficiary access PIN' })
    const verify = screen.getByRole('button', { name: 'Verify and enter' })

    fireEvent.change(pin, { target: { value: '9999' } })
    fireEvent.click(verify)

    expect(
      await screen.findByText(
        'The PIN is incorrect. Personal details remain hidden; check the PIN and retry.',
      ),
    ).toBeTruthy()
    expect((pin as HTMLInputElement).value).toBe('')
    fireEvent.change(pin, { target: { value: '2468' } })

    fireEvent.click(verify)
    expect(await screen.findByText('Scoped beneficiary content')).toBeTruthy()
  })
})
