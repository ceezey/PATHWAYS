/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ChangeEvent, ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { mockProjects } from '@/mocks/pathways/projects'
import { testBeneficiaries } from '@/mocks/pathways/real-api-fixtures'

import { sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'
import { BeneficiaryForm } from './beneficiary-form'

const { client, routerPush, toastError, toastSuccess } = vi.hoisted(() => ({
  client: {
    getDigitalForms: vi.fn(),
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
    let resolve!: (forms: Array<Record<string, unknown>>) => void
    client.getDigitalForms.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const view = render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save beneficiary' }),
    )
    await waitFor(() => expect(client.getDigitalForms).toHaveBeenCalledOnce())
    profileState.userId = 'actor-b'
    view.rerender(<BeneficiaryForm projects={mockProjects} />)
    resolve([
      {
        id: 'registration-form',
        status: 'PUBLISHED',
        formType: 'BENEFICIARY_REGISTRATION',
        version: 1,
      },
    ])
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
    client.getDigitalForms.mockResolvedValue([
      {
        id: 'registration-form',
        formType: 'BENEFICIARY_REGISTRATION',
        status: 'PUBLISHED',
        version: 2,
      },
    ])
    client.registerBeneficiary.mockResolvedValue(saved)

    render(<BeneficiaryForm projects={mockProjects} />)
    await completeSelects()
    await screen.findByText(/Recovered your unsaved beneficiary draft/)
    fireEvent.click(screen.getByRole('button', { name: 'Save beneficiary' }))
    const confirmation = screen.getByRole('dialog')
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
    client.getDigitalForms.mockResolvedValue([
      {
        id: 'registration-form',
        formType: 'BENEFICIARY_REGISTRATION',
        status: 'PUBLISHED',
        version: 1,
      },
    ])
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
})
