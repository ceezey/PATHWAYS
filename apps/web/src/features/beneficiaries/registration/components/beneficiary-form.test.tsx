/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
})
