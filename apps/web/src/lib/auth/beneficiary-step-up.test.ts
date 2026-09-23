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
  it('opens only the current UI boundary and stores no browser-local authorization', async () => {
    render(
      createElement(
        BeneficiaryAccessGate,
        null,
        createElement('p', null, 'Authorized server-scoped content'),
      ),
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Beneficiary access PIN' }), {
      target: { value: '2468' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enter' }))
    expect(await screen.findByText('Authorized server-scoped content')).toBeTruthy()
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.length).toBe(0)
  })
})
