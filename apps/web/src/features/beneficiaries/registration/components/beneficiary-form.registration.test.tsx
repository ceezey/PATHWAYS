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

describe('BeneficiaryForm registration', () => {
  it('registers through the published project form and preserves the server identity', async () => {
    const saved = { ...testBeneficiaries[0], id: 'beneficiary-created', code: validDraft.code }
    window.sessionStorage.setItem(draftKey(validDraft.projectId), JSON.stringify(validDraft))
    client.getBeneficiaryRegistrationContext.mockResolvedValue(
      context([
        {
          id: 'registration-form',
          formType: 'BENEFICIARY_REGISTRATION',
          status: 'PUBLISHED',
          version: 2,
        },
      ]),
    )
    client.registerBeneficiary.mockResolvedValue(saved)

    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Recovered your unsaved beneficiary draft/)
    await screen.findByText(/Registration, version/)
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    const confirmation = await screen.findByRole('dialog')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Save beneficiary' }))

    await waitFor(() => expect(client.registerBeneficiary).toHaveBeenCalledTimes(1))
    expect(client.registerBeneficiary).toHaveBeenCalledWith(
      validDraft.projectId,
      expect.objectContaining({
        formId: 'registration-form',
        clientRegistrationId: expect.any(String),
        values: expect.objectContaining({
          registration_operation: 'CREATE',
          beneficiary_code: validDraft.code,
          consent_recorded: true,
          data_processing_consent_recorded: true,
        }),
      }),
    )
    expect(routerPush).toHaveBeenCalledWith(
      `/beneficiaries/beneficiary-created?projectId=${encodeURIComponent(validDraft.projectId)}`,
    )
  })

  it('keeps an exact-code rejection truthful and does not navigate', async () => {
    window.sessionStorage.setItem(draftKey(validDraft.projectId), JSON.stringify(validDraft))
    client.getBeneficiaryRegistrationContext.mockResolvedValue(
      context([
        {
          id: 'registration-form',
          formType: 'BENEFICIARY_REGISTRATION',
          status: 'PUBLISHED',
          version: 1,
        },
      ]),
    )
    client.registerBeneficiary.mockRejectedValue(new Error('Beneficiary code already exists.'))

    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Recovered your unsaved beneficiary draft/)
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save beneficiary' }),
    )

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Beneficiary code already exists.'))
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('updates a supported profile with optimistic concurrency and keeps identity fields fixed', async () => {
    const beneficiary = testBeneficiaries[0]
    if (!beneficiary) throw new Error('Expected a beneficiary fixture.')
    client.updateBeneficiary.mockResolvedValue(beneficiary)

    render(<BeneficiaryForm beneficiary={beneficiary} projects={mockProjects} />)

    expect((screen.getByLabelText(/Beneficiary code/) as HTMLInputElement).disabled).toBe(true)
    expect(
      (screen.getByLabelText(/Beneficiary consent confirmed/) as HTMLInputElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByLabelText(/Data storage consent confirmed/) as HTMLInputElement).disabled,
    ).toBe(true)
    expect(screen.queryByLabelText(/Beneficiary is a minor/)).toBeNull()
    expect(screen.queryByLabelText(/Guardian consent confirmed/)).toBeNull()
    expect(screen.getByText(/Consent and minor-status provenance are read only/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/City or municipality/), {
      target: { value: 'Updated Test City' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }),
    )

    await waitFor(() => expect(client.updateBeneficiary).toHaveBeenCalledTimes(1))
    expect(client.updateBeneficiary).toHaveBeenCalledWith(
      validDraft.projectId,
      beneficiary.id,
      expect.objectContaining({
        locationCityMunicipality: 'Updated Test City',
        expectedUpdatedAt: beneficiary.updatedAt,
      }),
    )
    expect(routerPush).toHaveBeenCalledWith(
      `/beneficiaries/${beneficiary.id}?projectId=${encodeURIComponent(validDraft.projectId)}`,
    )
  })
  it('requires explicit selection and preserves custom required values for the selected definition', async () => {
    window.sessionStorage.setItem(draftKey(validDraft.projectId), JSON.stringify(validDraft))
    const value = context([
      { id: 'registration-first', version: 1 },
      { id: 'registration-second', version: 1 },
    ])
    value.definitions[1].code = 'second_registration'
    value.definitions[1].fields.push({
      id: 'custom-text',
      code: 'custom_required',
      label: 'Additional registration detail',
      dataType: 'TEXT',
      required: true,
      allowedValues: null,
      metadataKey: false,
      sadddField: false,
      sequence: 100,
    })
    client.getBeneficiaryRegistrationContext.mockResolvedValue(value)
    client.registerBeneficiary.mockResolvedValue({ id: 'created' })
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByRole('combobox', { name: 'Published registration form' })
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Published registration form' }), {
      target: { value: 'registration-second' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Additional registration detail/), {
      target: { value: 'Synthetic custom response' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save beneficiary' }))
    await waitFor(() =>
      expect(client.registerBeneficiary).toHaveBeenCalledWith(
        validDraft.projectId,
        expect.objectContaining({
          formId: 'registration-second',
          values: expect.objectContaining({
            custom_required: 'Synthetic custom response',
            enrollment_date: '2026-09-27',
          }),
        }),
      ),
    )
  })
  it('provisions the default form once when no published form exists and registers through it', async () => {
    window.sessionStorage.setItem(draftKey(validDraft.projectId), JSON.stringify(validDraft))
    client.getBeneficiaryRegistrationContext.mockResolvedValue(context([]))
    const provisioned = context([{ id: 'system-default-form', version: 1 }])
    provisioned.definitions[0].code = 'system_default_registration'
    provisioned.definitions[0].name = 'Beneficiary registration'
    client.ensureDefaultRegistrationForm.mockResolvedValue(provisioned)
    client.registerBeneficiary.mockResolvedValue({ id: 'created-through-default' })
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Beneficiary registration, version 1/)
    expect(client.ensureDefaultRegistrationForm).toHaveBeenCalledOnce()
    expect(client.ensureDefaultRegistrationForm).toHaveBeenCalledWith(validDraft.projectId)
    expect(screen.queryByText(/No published registration form/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save beneficiary' }),
    )
    await waitFor(() =>
      expect(client.registerBeneficiary).toHaveBeenCalledWith(
        validDraft.projectId,
        expect.objectContaining({ formId: 'system-default-form' }),
      ),
    )
    expect(client.ensureDefaultRegistrationForm).toHaveBeenCalledOnce()
  })

  it('does not provision a default form when the project has a published form', async () => {
    client.getBeneficiaryRegistrationContext.mockResolvedValue(
      context([{ id: 'registration-form', version: 1 }]),
    )
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Registration, version 1/)
    expect(client.ensureDefaultRegistrationForm).not.toHaveBeenCalled()
  })

  it('keeps a project with no published form unavailable without retrying or submitting', async () => {
    window.sessionStorage.setItem(draftKey(validDraft.projectId), JSON.stringify(validDraft))
    client.getBeneficiaryRegistrationContext.mockResolvedValue(context([]))
    client.ensureDefaultRegistrationForm.mockResolvedValue(context([]))
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    const unavailable = await screen.findByText(/No registration form is available/)
    expect(unavailable.getAttribute('role')).toBe('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(client.registerBeneficiary).not.toHaveBeenCalled()
    expect(client.ensureDefaultRegistrationForm).toHaveBeenCalledOnce()
  })

  it('keeps a provisioning failure distinct from empty data and retries exactly once per request', async () => {
    client.getBeneficiaryRegistrationContext.mockResolvedValue(context([]))
    client.ensureDefaultRegistrationForm.mockRejectedValueOnce(new Error('forbidden'))
    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText('Registration forms could not be loaded.')
    expect(screen.queryByText(/No registration form is available/)).toBeNull()
    expect(client.ensureDefaultRegistrationForm).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Retry registration forms' }))
    await waitFor(() => expect(client.ensureDefaultRegistrationForm).toHaveBeenCalledTimes(2))
    expect(client.getBeneficiaryRegistrationContext).toHaveBeenCalledTimes(2)
  })
})
