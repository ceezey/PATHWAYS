// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { type ReactNode, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/pathways/dialog-shell', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement('section', null, createElement('h1', null, title), children),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

import { BeneficiaryAccessGate } from '@/components/layout/beneficiary-access-gate'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe('beneficiary PIN boundary', () => {
  it('does not create browser-local access after the PIN 2468 is entered', async () => {
    render(createElement(BeneficiaryAccessGate))
    fireEvent.change(screen.getByRole('textbox', { name: 'Beneficiary access PIN' }), {
      target: { value: '2468' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enter' }))
    expect(await screen.findByText(/server verification is not configured/)).toBeTruthy()
    expect(window.sessionStorage.length).toBe(0)
  })
})
