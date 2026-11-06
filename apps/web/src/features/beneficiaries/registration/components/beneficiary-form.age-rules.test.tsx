/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { testBeneficiaries } from '@/test/fixtures/api-view-fixtures'
import { mockProjects } from '@/test/fixtures/projects'

import {
  completeSelects,
  context,
  draftKey,
  profileState,
  validDraft,
} from '@/test/fixtures/beneficiary-form-fixtures'
import { BeneficiaryForm } from './beneficiary-form'

const { client, routerPush, toastError, toastSuccess } = vi.hoisted(() => ({
  client: {
    ensureDefaultRegistrationForm: vi.fn(),
    getBeneficiaryRegistrationContext: vi.fn(),
    registerBeneficiary: vi.fn(),
    updateBeneficiary: vi.fn(),
  },
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: client }))
vi.mock('@/lib/api/beneficiaries', () => ({ beneficiariesClient: client }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))
vi.mock('@/components/ui/select', async () =>
  (await import('@/test/fixtures/beneficiary-form-fixtures')).selectMock(),
)
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: profileState }) }))

beforeEach(() => {
  client.getBeneficiaryRegistrationContext.mockImplementation(async (projectId: string) => ({
    ...context([]),
    projectId,
  }))
  client.ensureDefaultRegistrationForm.mockImplementation(async (projectId: string) => ({
    ...context([]),
    projectId,
  }))
})

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.clearAllMocks()
  profileState.userId = 'actor-a'
  profileState.organizationId = 'org-a'
})

describe('BeneficiaryForm age rules', () => {
  it('derives minor status from the birth date and shows guardian consent only for minors', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({ ...validDraft, birthDate: '', age: '', guardianConsent: false }),
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(
      context([{ id: 'registration-form', version: 1 }]),
    )
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Registration, version 1/)
    expect(screen.queryByLabelText(/Beneficiary is a minor/)).toBeNull()
    const birthDate = screen.getByLabelText(/Birth date/) as HTMLInputElement

    fireEvent.change(birthDate, { target: { value: '2014-01-01' } })
    expect(screen.getByLabelText(/Guardian consent confirmed/)).toBeTruthy()

    fireEvent.change(birthDate, { target: { value: '2000-01-01' } })
    expect(screen.queryByLabelText(/Guardian consent confirmed/)).toBeNull()
  })
  it('caps the birth date, derives a read-only age and shows the minimum-age error accessibly', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({ ...validDraft, birthDate: '', age: '', guardianConsent: true }),
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(
      context([{ id: 'registration-form', version: 1 }]),
    )
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Registration, version 1/)
    const birthDate = screen.getByLabelText(/Birth date/) as HTMLInputElement
    const age = screen.getByLabelText(/^Age/) as HTMLInputElement
    expect(birthDate.max).toBe('2026-09-27')
    expect(age.min).toBe('5')
    expect(age.readOnly).toBe(false)

    fireEvent.change(birthDate, { target: { value: '2021-09-28' } })
    expect(age.readOnly).toBe(true)
    expect(age.value).toBe('4')
    expect(age.getAttribute('aria-describedby')).toBe('beneficiary-age-hint')
    expect(screen.getByText('Calculated from the birth date.').id).toBe('beneficiary-age-hint')
    // The rule error is shown inline at once, associated with the birth date control.
    expect(birthDate.getAttribute('aria-invalid')).toBe('true')
    expect(birthDate.getAttribute('aria-describedby')).toBe('beneficiary-birth-date-error')
    expect(document.getElementById('beneficiary-birth-date-error')?.textContent).toBe(
      'Beneficiary must be at least 5 years old.',
    )
    const live = document.querySelector('[aria-live="polite"].sr-only')
    expect(live?.textContent).toBe('Beneficiary must be at least 5 years old.')

    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(birthDate)
    expect(
      within(screen.getByRole('alert', { name: /before saving/ })).getByText(
        'Beneficiary must be at least 5 years old.',
      ),
    ).toBeTruthy()

    fireEvent.change(birthDate, { target: { value: '2021-09-27' } })
    expect(age.value).toBe('5')
    expect(birthDate.getAttribute('aria-invalid')).toBe('false')
    expect(live?.textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save beneficiary' }),
    )
    await waitFor(() =>
      expect(client.registerBeneficiary).toHaveBeenCalledWith(
        validDraft.projectId,
        expect.objectContaining({
          values: expect.objectContaining({ birth_date: '2021-09-27', age_at_registration: 5 }),
        }),
      ),
    )
  })

  it('rejects a future birth date inline and never submits it', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({ ...validDraft, birthDate: '2026-09-28' }),
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(
      context([{ id: 'registration-form', version: 1 }]),
    )
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Registration, version 1/)
    expect(document.getElementById('beneficiary-birth-date-error')?.textContent).toBe(
      'Date of birth cannot be in the future.',
    )
    expect((screen.getByLabelText(/^Age/) as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(client.registerBeneficiary).not.toHaveBeenCalled()
  })

  it('applies the minimum to an entered age when the form has no birth date', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({
        ...validDraft,
        birthDate: '',
        age: '4',
        isMinor: true,
        guardianConsent: true,
      }),
    )
    const value = context([{ id: 'age-registration', version: 1 }])
    value.definitions[0].fields = value.definitions[0].fields.filter(
      (field) => field.code !== 'birth_date',
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(value)
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Registration, version 1/)
    const age = screen.getByLabelText(/^Age/) as HTMLInputElement
    expect(age.readOnly).toBe(false)
    expect(age.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById('beneficiary-age-error')?.textContent).toBe(
      'Beneficiary must be at least 5 years old.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(document.activeElement).toBe(age)
    expect(client.registerBeneficiary).not.toHaveBeenCalled()
  })

  it('shows guardian consent on an edit by the age today, not the stored minor flag or the enrollment age', async () => {
    // 12:00 on 2026-10-26 in Manila.
    vi.useFakeTimers({ now: new Date('2026-10-26T04:00:00.000Z'), toFake: ['Date'] })
    try {
      const person = (birthDate: string, isMinor: boolean) => ({
        ...testBeneficiaries[0],
        birthDate,
        age: 17,
        isMinor,
        guardianConsent: false,
        enrollments: testBeneficiaries[0].enrollments.map((enrollment) => ({
          ...enrollment,
          enrolledAt: '2026-01-10',
        })),
      })
      // Both are 17 at enrollment; only the second is still under 18 today.
      const { unmount } = render(
        <BeneficiaryForm beneficiary={person('2008-08-17', true)} projects={mockProjects} />,
      )
      expect(screen.queryByLabelText(/Guardian consent confirmed/)).toBeNull()
      unmount()
      render(<BeneficiaryForm beneficiary={person('2008-11-01', false)} projects={mockProjects} />)
      expect(screen.getByLabelText(/Guardian consent confirmed/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a legacy under-5 profile editable when its birth date is unchanged', async () => {
    const legacy = {
      ...testBeneficiaries[0],
      birthDate: '2023-01-01',
      age: 3,
      isMinor: true,
      guardianConsent: true,
      enrollments: testBeneficiaries[0].enrollments.map((enrollment) => ({
        ...enrollment,
        enrolledAt: '2026-01-01',
      })),
    }
    client.updateBeneficiary.mockResolvedValue(legacy)
    render(<BeneficiaryForm beneficiary={legacy} projects={mockProjects} />)
    const birthDate = screen.getByLabelText(/Birth date/) as HTMLInputElement
    expect(birthDate.getAttribute('aria-invalid')).toBe('false')
    expect((screen.getByLabelText(/^Age/) as HTMLInputElement).value).toBe('3')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }),
    )
    await waitFor(() =>
      expect(client.updateBeneficiary).toHaveBeenCalledWith(
        validDraft.projectId,
        legacy.id,
        expect.objectContaining({ birthDate: '2023-01-01', ageAtRegistration: 3 }),
      ),
    )

    fireEvent.change(birthDate, { target: { value: '2022-06-01' } })
    expect(document.getElementById('beneficiary-birth-date-error')?.textContent).toBe(
      'Beneficiary must be at least 5 years old.',
    )
  })
})
