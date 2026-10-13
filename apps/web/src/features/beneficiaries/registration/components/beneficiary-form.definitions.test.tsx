/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockProjects } from '@/test/fixtures/projects'

import {
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

describe('BeneficiaryForm definitions', () => {
  it('submits a sparse definition with empty unsupported sex/disability draft values', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({ ...validDraft, sex: '', disabilityStatus: '' }),
    )
    const value = context([{ id: 'sparse-registration', version: 1 }])
    value.definitions[0].fields = value.definitions[0].fields.filter(
      (field) =>
        ![
          'sex',
          'disability_status',
          'external_identifier_type',
          'external_identifier_value',
          'profile_update_fields',
        ].includes(field.code),
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(value)
    client.registerBeneficiary.mockResolvedValue({ id: 'created' })
    render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
      target: { value: validDraft.projectId },
    })
    await screen.findByText(/Registration, version/)
    expect(screen.queryByLabelText(/^Sex/)).toBeNull()
    expect(screen.queryByLabelText(/Disability status/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save beneficiary' }))
    await waitFor(() => expect(client.registerBeneficiary).toHaveBeenCalledOnce())
    const values = client.registerBeneficiary.mock.calls[0][1].values
    for (const code of [
      'sex',
      'disability_status',
      'external_identifier_type',
      'external_identifier_value',
      'profile_update_fields',
    ])
      expect(values).not.toHaveProperty(code)
    expect(values).toEqual(
      expect.objectContaining({
        first_name: 'Synthetic',
        last_name: 'Person',
        birth_date: '2000-01-01',
        consent_recorded: true,
        data_processing_consent_recorded: true,
      }),
    )
  })
  it('counts only supported invalid inputs in sparse-form feedback', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({ ...validDraft, sex: '', disabilityStatus: '', firstName: '' }),
    )
    const value = context([{ id: 'sparse-registration', version: 1 }])
    value.definitions[0].fields = value.definitions[0].fields.filter(
      (field) => !['sex', 'disability_status'].includes(field.code),
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(value)
    render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
      target: { value: validDraft.projectId },
    })
    await screen.findByText(/Registration, version/)
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(toastError).toHaveBeenCalledWith(
      'Check beneficiary form fields.',
      expect.objectContaining({ description: expect.stringContaining('1 field needs attention.') }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(client.registerBeneficiary).not.toHaveBeenCalled()
  })
  it('explains an individual-incompatible general definition before confirmation', async () => {
    window.sessionStorage.setItem(draftKey(validDraft.projectId), JSON.stringify(validDraft))
    const value = context([{ id: 'general-registration', version: 1 }])
    value.definitions[0].fields = value.definitions[0].fields.filter(
      (field) =>
        !['first_name', 'last_name', 'birth_date', 'age_at_registration'].includes(field.code),
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(value)
    render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
      target: { value: validDraft.projectId },
    })
    await screen.findByText(
      /This published definition does not support the current individual registration/,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(client.registerBeneficiary).not.toHaveBeenCalled()
  })
  it('focuses the supported AGE-only control and associates missing-answer errors', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({ ...validDraft, age: '' }),
    )
    const value = context([{ id: 'age-registration', version: 1 }])
    value.definitions[0].fields = value.definitions[0].fields.filter(
      (field) => field.code !== 'birth_date',
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(value)
    render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
      target: { value: validDraft.projectId },
    })
    await screen.findByText(/Registration, version/)
    expect(screen.queryByLabelText(/Birth date/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    const age = screen.getByLabelText(/^Age/) as HTMLInputElement
    expect(document.activeElement).toBe(age)
    expect(age.getAttribute('aria-invalid')).toBe('true')
    expect(age.getAttribute('aria-describedby')).toBe('beneficiary-age-error')
    expect(document.getElementById('beneficiary-age-error')?.textContent).toContain(
      'accepted by the selected form',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(client.registerBeneficiary).not.toHaveBeenCalled()
  })
  it('rejects minor-incompatible definitions from accepted age despite unchecked minor draft flag', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({ ...validDraft, birthDate: '2015-01-01', isMinor: false }),
    )
    const value = context([{ id: 'minor-incompatible', version: 1 }])
    value.definitions[0].fields = value.definitions[0].fields.filter(
      (field) => !['is_minor', 'guardian_consent_recorded'].includes(field.code),
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(value)
    render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
      target: { value: validDraft.projectId },
    })
    await screen.findByText(
      /This published definition does not support the current individual registration/,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(client.registerBeneficiary).not.toHaveBeenCalled()
  })
  it('does not let an adult stale hidden minor flag block an otherwise supported registration', async () => {
    window.sessionStorage.setItem(
      draftKey(validDraft.projectId),
      JSON.stringify({ ...validDraft, isMinor: true, guardianConsent: false }),
    )
    const value = context([{ id: 'adult-registration', version: 1 }])
    value.definitions[0].fields = value.definitions[0].fields.filter(
      (field) => !['is_minor', 'guardian_consent_recorded'].includes(field.code),
    )
    client.getBeneficiaryRegistrationContext.mockResolvedValue(value)
    client.registerBeneficiary.mockResolvedValue({ id: 'adult-created' })
    render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
      target: { value: validDraft.projectId },
    })
    await screen.findByText(/Registration, version/)
    expect(screen.queryByText(/does not support the current individual registration/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save beneficiary' }))
    await waitFor(() => expect(client.registerBeneficiary).toHaveBeenCalledOnce())
  })
})
