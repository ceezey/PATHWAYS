/* @vitest-environment jsdom */

import { beneficiaryRegistrationFieldRules } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ChangeEvent, ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockProjects } from '@/mocks/pathways/projects'
import { testBeneficiaries } from '@/mocks/pathways/real-api-fixtures'

import { sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'
import {
  BeneficiaryForm,
  projectRegistrationValues,
  registrationAgeAtDate,
} from './beneficiary-form'

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
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))
vi.mock('@/components/ui/select', async () => {
  const { Children, createElement, isValidElement } = await import('react')
  const SelectContent = () => null
  const SelectItem = () => null
  const SelectTrigger = () => null
  return {
    Select: ({
      children,
      disabled,
      onValueChange,
      value,
    }: {
      children: ReactNode
      disabled?: boolean
      onValueChange?: (value: string) => void
      value?: string
    }) => {
      let triggerProps: Record<string, unknown> = {}
      const options: ReactNode[] = []
      Children.forEach(children, (child) => {
        if (!isValidElement(child)) return
        if (child.type === SelectTrigger) triggerProps = child.props as Record<string, unknown>
        if (child.type !== SelectContent) return
        Children.forEach((child.props as { children?: ReactNode }).children, (item) => {
          if (!isValidElement(item) || item.type !== SelectItem) return
          const props = item.props as { children?: ReactNode; value: string }
          options.push(
            createElement('option', { key: props.value, value: props.value }, props.children),
          )
        })
      })
      return createElement(
        'select',
        {
          ...triggerProps,
          disabled,
          value,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => onValueChange?.(event.target.value),
        },
        options,
      )
    },
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue: () => null,
  }
})

const profileState = {
  userId: 'actor-a',
  organizationId: 'org-a',
  roles: ['PROJECT_OFFICER'],
  permissions: ['beneficiaries.records.register', 'beneficiaries.profiles.update'],
  assignedProjectIds: mockProjects.map((p) => p.id),
}
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: profileState }) }))
const draftKey = (projectId: string | null = null) =>
  sensitiveDraftKey('beneficiary', {
    userId: profileState.userId,
    organizationId: profileState.organizationId,
    projectId,
    resourceId: null,
  })
const validDraft = {
  code: 'BEN-C3-NEW-001',
  firstName: 'Synthetic',
  middleName: '',
  lastName: 'Person',
  sex: 'Not specified',
  birthDate: '2000-01-01',
  age: '',
  disabilityStatus: 'Not specified',
  province: 'Test Province',
  city: 'Test City',
  barangay: 'Test Barangay',
  consentToParticipate: true,
  consentToStoreData: true,
  isMinor: false,
  guardianConsent: false,
  projectId: mockProjects[0]?.id ?? 'project-a',
}

const context = (
  definitions: { id: string; version: number; status?: string; formType?: string }[],
) => ({
  projectId: validDraft.projectId,
  businessDate: '2026-09-27',
  definitions: definitions.map((definition) => ({
    ...definition,
    code: 'REGISTRATION',
    name: 'Registration',
    status: 'PUBLISHED' as const,
    formType: 'BENEFICIARY_REGISTRATION' as const,
    fields: Object.entries(beneficiaryRegistrationFieldRules).map(([code, rule], index) => ({
      id: code,
      code,
      label: code,
      dataType: rule.dataType,
      required: 'required' in rule ? rule.required : false,
      allowedValues: 'allowedValues' in rule ? [...rule.allowedValues] : null,
      metadataKey: false,
      sadddField: false,
      sequence: index + 1,
    })),
  })),
})
const completeSelects = async () => {
  fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
    target: { value: validDraft.projectId },
  })
  fireEvent.change(screen.getByRole('combobox', { name: /Sex/ }), {
    target: { value: validDraft.sex },
  })
  fireEvent.change(screen.getByRole('combobox', { name: /Disability status/ }), {
    target: { value: validDraft.disabilityStatus },
  })
}

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

describe('BeneficiaryForm', () => {
  it('preserves protected canonical precedence and omits fields not in the selected definition', () => {
    expect(
      projectRegistrationValues(
        [{ code: 'consent_recorded' }, { code: 'custom_detail' }],
        { consent_recorded: true, sex: 'NOT_SPECIFIED' },
        { consent_recorded: false, custom_detail: 'Synthetic', outside: 'omit' },
      ),
    ).toEqual({ consent_recorded: true, custom_detail: 'Synthetic' })
  })
  it('does not restore globally scoped legacy PII', () => {
    window.sessionStorage.setItem('pathways.beneficiaryDraft', JSON.stringify(validDraft))
    render(<BeneficiaryForm projects={mockProjects} />)
    expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe('')
    expect(screen.queryByText(/Recovered your unsaved beneficiary draft/)).toBeNull()
  })
  it('never transfers PII or consent between projects', () => {
    render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
      target: { value: mockProjects[0].id },
    })
    fireEvent.change(screen.getByLabelText(/First name/), {
      target: { value: 'Private synthetic name' },
    })
    fireEvent.click(screen.getByLabelText(/Beneficiary consent confirmed/))
    fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
      target: { value: mockProjects[1].id },
    })
    expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe('')
    expect(
      (screen.getByLabelText(/Beneficiary consent confirmed/) as HTMLInputElement).checked,
    ).toBe(false)
  })
  it('hides old values on an actor or organization change without waiting for reset effects', () => {
    const view = render(<BeneficiaryForm projects={mockProjects} />)
    fireEvent.change(screen.getByLabelText(/First name/), {
      target: { value: 'Actor A private draft' },
    })
    profileState.userId = 'actor-b'
    profileState.organizationId = 'org-b'
    view.rerender(<BeneficiaryForm projects={mockProjects} />)
    expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe('')
    expect(window.sessionStorage.getItem(draftKey())).toBeNull()
  })
  it('cannot register after scope changes while form discovery awaits', async () => {
    window.sessionStorage.setItem(draftKey(validDraft.projectId), JSON.stringify(validDraft))
    let resolve!: (forms: unknown) => void
    client.getBeneficiaryRegistrationContext.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const view = render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    await waitFor(() => expect(client.getBeneficiaryRegistrationContext).toHaveBeenCalledOnce())
    profileState.userId = 'actor-b'
    view.rerender(<BeneficiaryForm projects={mockProjects} />)
    resolve(
      context([
        {
          id: 'registration-form',
          status: 'PUBLISHED',
          formType: 'BENEFICIARY_REGISTRATION',
          version: 1,
        },
      ]),
    )
    await Promise.resolve()
    expect(client.registerBeneficiary).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
  })
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

    expect(window.sessionStorage.getItem(draftKey())).toContain('BEN-PROT-RECOVERED')
    firstRender.unmount()

    render(<BeneficiaryForm projects={mockProjects} />)
    expect(await screen.findByText(/Recovered your unsaved beneficiary draft/)).toBeTruthy()
    expect((screen.getByLabelText(/Beneficiary code/) as HTMLInputElement).value).toBe(
      'BEN-PROT-RECOVERED',
    )
  })

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
    expect((screen.getByLabelText(/Beneficiary is a minor/) as HTMLInputElement).disabled).toBe(
      true,
    )
    expect((screen.getByLabelText(/Guardian consent confirmed/) as HTMLInputElement).disabled).toBe(
      true,
    )
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
  it('uses captured business calendar birthday boundaries and rejects invalid dates for applicability', () => {
    expect(registrationAgeAtDate('2008-09-28', '', '2026-09-27')).toEqual({ age: 17, error: null })
    expect(registrationAgeAtDate('2008-09-27', '', '2026-09-27')).toEqual({ age: 18, error: null })
    expect(registrationAgeAtDate('2026-99-99', '', '2026-09-27')).toEqual({
      age: null,
      error: null,
    })
    expect(registrationAgeAtDate('', '17', '2026-09-27')).toEqual({ age: 17, error: null })
  })

  it('reports the minimum age at the boundary and a future birth date as errors, not a silent null', () => {
    expect(registrationAgeAtDate('2021-09-27', '', '2026-09-27')).toEqual({ age: 5, error: null })
    expect(registrationAgeAtDate('2021-09-28', '', '2026-09-27')).toEqual({
      age: 4,
      error: 'Beneficiary must be at least 5 years old.',
    })
    expect(registrationAgeAtDate('', '4', '2026-09-27')).toEqual({
      age: 4,
      error: 'Beneficiary must be at least 5 years old.',
    })
    expect(registrationAgeAtDate('', '5', null)).toEqual({ age: 5, error: null })
    expect(registrationAgeAtDate('2026-09-28', '', '2026-09-27')).toEqual({
      age: null,
      error: 'Date of birth cannot be in the future.',
    })
    // An edit measures age at its enrollment date but caps the birth date at the business date.
    expect(registrationAgeAtDate('2021-01-01', '', '2026-01-15', '2026-09-27')).toEqual({
      age: 5,
      error: null,
    })
    expect(registrationAgeAtDate('2026-10-01', '', '2026-01-15', '2026-09-27').error).toBe(
      'Date of birth cannot be in the future.',
    )
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
