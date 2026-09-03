/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mockProjects } from '@/mocks/pathways/projects'

import { BeneficiaryForm } from './beneficiary-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe('BeneficiaryForm', () => {
  it('reports every invalid field, associates messages, focuses first invalid, and retains input', () => {
    render(<BeneficiaryForm projects={mockProjects} />)

    const code = screen.getByLabelText(/Beneficiary code/) as HTMLInputElement
    const lastName = screen.getByLabelText(/Last name/) as HTMLInputElement
    const save = screen.getByRole('button', { name: 'Save beneficiary' })

    fireEvent.click(save)

    const summary = screen.getByRole('alert')
    expect(summary.querySelectorAll('li')).toHaveLength(11)
    expect(document.activeElement).toBe(code)
    expect(code.getAttribute('aria-invalid')).toBe('true')
    expect(
      document.getElementById(code.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('Enter a beneficiary code beyond BEN-PROT-.')

    const participationConsent = screen.getByLabelText(/Beneficiary consent confirmed/)
    expect(participationConsent.getAttribute('aria-invalid')).toBe('true')
    expect(
      document.getElementById(participationConsent.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toContain('Confirm beneficiary consent to participate.')

    fireEvent.change(code, { target: { value: 'BEN-PROT-1042' } })
    fireEvent.change(lastName, { target: { value: 'Sample' } })
    fireEvent.click(save)

    expect(code.value).toBe('BEN-PROT-1042')
    expect(lastName.value).toBe('Sample')
    expect(document.activeElement).toBe(screen.getByLabelText(/Project enrollment/))
  })

  it('recovers unsaved entries after the editor is remounted', async () => {
    const firstRender = render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByLabelText(/Beneficiary code/), {
      target: { value: 'BEN-PROT-RECOVERED' },
    })
    fireEvent.change(screen.getByLabelText(/Last name/), {
      target: { value: 'Preserved' },
    })

    expect(window.sessionStorage.getItem('pathways.beneficiaryDraft')).toContain(
      'BEN-PROT-RECOVERED',
    )
    firstRender.unmount()

    render(<BeneficiaryForm projects={mockProjects} />)
    expect(await screen.findByText(/Recovered your unsaved beneficiary draft/)).toBeTruthy()
    expect((screen.getByLabelText(/Beneficiary code/) as HTMLInputElement).value).toBe(
      'BEN-PROT-RECOVERED',
    )
    expect((screen.getByLabelText(/Last name/) as HTMLInputElement).value).toBe('Preserved')
  })
})
