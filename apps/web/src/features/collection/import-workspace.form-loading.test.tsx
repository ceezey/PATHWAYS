/* @vitest-environment jsdom */
import { DisplayLabelsProvider } from '@/providers/display-labels-provider'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportWorkspace } from './import-workspace'

const state = vi.hoisted(() => ({
  profile: {
    id: 'auth-1',
    userId: 'actor-1',
    organizationId: 'org-1',
    roles: ['PROJECT_OFFICER'],
    permissions: ['imports.upload', 'imports.read', 'forms.read'],
    assignedProjectIds: ['project-1'],
  },
}))
const api = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getDigitalForms: vi.fn(),
  getImportBatches: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Radix mounts list content only when opened; the mock marks it for inspection.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div data-select-content="">{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const noForms = () => screen.getAllByText('No forms available.')

describe('import published form version loading', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.profile = {
      ...state.profile,
      roles: ['PROJECT_OFFICER'],
      permissions: ['imports.upload', 'imports.read', 'forms.read'],
    }
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getImportBatches.mockResolvedValue([])
  })
  afterEach(cleanup)

  it('shows loading bars only inside the form list while forms load', async () => {
    api.getDigitalForms.mockReturnValue(new Promise(() => {}))
    render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
    const bars = await screen.findByLabelText('Loading published form versions')
    expect(bars.closest('[data-select-content]')).not.toBeNull()
    expect(screen.getAllByLabelText('Loading published form versions')).toHaveLength(1)
    expect(screen.getAllByText('Choose form').length).toBeGreaterThan(0)
  })

  it('says no forms are available when the project has no published form', async () => {
    api.getDigitalForms.mockResolvedValue([
      { id: 'form-1', projectId: 'project-1', name: 'Draft', version: 1, status: 'DRAFT' },
    ])
    render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
    await waitFor(() => expect(noForms()).toHaveLength(2))
    const [placeholder, listMessage] = noForms()
    expect(placeholder.closest('[data-select-content]')).toBeNull()
    expect(listMessage.closest('[data-select-content]')).not.toBeNull()
  })

  it('offers a back link to Forms only to roles that can open the forms route', async () => {
    api.getDigitalForms.mockResolvedValue([])
    render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
    await waitFor(() => expect(noForms()).toHaveLength(2))
    expect(screen.queryByRole('link', { name: 'Forms' })).toBeNull()
    cleanup()

    state.profile = {
      ...state.profile,
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: [...state.profile.permissions, 'forms.manage'],
    }
    render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
    const link = await screen.findByRole('link', { name: 'Forms' })
    expect(link.getAttribute('href')).toBe('/collection/forms')
  })
})
