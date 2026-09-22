/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createDemoBaseline,
  getDemoState,
  resetDemo,
  switchDemoAccount,
} from '@/lib/demo-state/store'
import { mockProjects } from '@/mocks/pathways/projects'
import { toTestBeneficiary } from '@/mocks/pathways/real-api-fixtures'

import { BeneficiaryForm } from './beneficiary-form'

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  routerPush.mockClear()
})

describe('BeneficiaryForm', () => {
  it('reports every invalid field, associates messages, focuses first invalid, and retains input', () => {
    render(<BeneficiaryForm projects={mockProjects} />)

    const code = screen.getByLabelText(/Beneficiary code/) as HTMLInputElement
    const lastName = screen.getByLabelText(/Last name/) as HTMLInputElement
    const save = screen.getByRole('button', { name: 'Save beneficiary' })

    fireEvent.click(save)

    const summary = screen.getByRole('alert')
    expect(summary.querySelectorAll('li')).toHaveLength(12)
    expect(document.activeElement).toBe(code)
    expect(code.getAttribute('aria-invalid')).toBe('true')
    expect(
      document.getElementById(code.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('Enter a beneficiary code.')

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

  it('uses the add-beneficiary form with an existing profile prefilled in edit mode', () => {
    const first = createDemoBaseline().beneficiaries[0]
    if (!first) throw new Error('Expected a beneficiary fixture.')
    const beneficiary = toTestBeneficiary(first)

    render(<BeneficiaryForm beneficiary={beneficiary} projects={mockProjects} />)

    expect(screen.getByRole('heading', { name: 'Edit beneficiary profile' })).toBeTruthy()
    expect((screen.getByLabelText(/Beneficiary code/) as HTMLInputElement).value).toBe(
      beneficiary.code,
    )
    expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe(
      beneficiary.firstName,
    )
    expect((screen.getByLabelText(/Last name/) as HTMLInputElement).value).toBe(
      beneficiary.lastName,
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to profile' }).getAttribute('href')).toBe(
      `/beneficiaries/${beneficiary.id}`,
    )
  })

  it('keeps edited fields unsaved when server-side beneficiary writes are unavailable', () => {
    resetDemo()
    switchDemoAccount('project-officer')
    const beneficiary = getDemoState().beneficiaries.find((record) =>
      record.projectIds.includes('futuremakers-ncr'),
    )
    expect(beneficiary).toBeDefined()
    if (!beneficiary) return

    render(<BeneficiaryForm beneficiary={toTestBeneficiary(beneficiary)} projects={mockProjects} />)

    fireEvent.change(screen.getByLabelText(/City or municipality/), {
      target: { value: 'Updated Demo City' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const confirmation = screen.getByRole('dialog')
    expect(within(confirmation).getByText('Confirm profile changes')).toBeTruthy()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Save changes' }))

    expect(getDemoState().beneficiaries.find((record) => record.id === beneficiary.id)?.city).toBe(
      beneficiary.city,
    )
    expect(routerPush).not.toHaveBeenCalledWith(`/beneficiaries/${beneficiary.id}`)
  })
})
