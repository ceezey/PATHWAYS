/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { CollectionWorkspace } from './collection-workspace'

const api = vi.hoisted(() => ({
  getProjectsForRole: vi.fn(),
  getDigitalForms: vi.fn(),
  getActivities: vi.fn(),
  getIndicators: vi.fn(),
  uploadImport: vi.fn(),
  automaticImportMapping: vi.fn(),
  getImportBatch: vi.fn(),
  saveImportMapping: vi.fn(),
  validateImport: vi.fn(),
  processImport: vi.fn(),
}))
const access = vi.hoisted(() => {
  const permissions = [
    'projects.read',
    'activities.read',
    'monitoring.read',
    'collection.read',
    'forms.read',
    'forms.export',
    'forms.manage',
    'forms.templates.import',
    'forms.publish',
    'submissions.write',
    'imports.read',
    'imports.upload',
    'imports.review',
    'imports.validate',
    'imports.process',
  ]
  return {
    role: 'Monitoring and Evaluation Officer',
    assignedProjectIds: ['project-a', 'project-b'],
    profile: {
      userId: 'actor-a',
      organizationId: 'org-a',
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions,
      assignedProjectIds: ['project-a', 'project-b'],
    },
  }
})

vi.mock('@/providers/current-role-provider', () => ({ useCurrentRole: () => access }))
vi.mock('@/lib/api/forms', () => ({ formsClient: api }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))

// Radix Select cannot open in jsdom without hanging on a page this large, so the trigger and
// options are rendered as a native select. The option list is what the test asserts.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type Part = { children?: React.ReactNode; value?: string; id?: string; placeholder?: string }
  type SelectProps = Part & { onValueChange?: (value: string) => void }
  const SelectTrigger = (_props: Part) => null
  const SelectValue = (_props: Part) => null
  const SelectContent = ({ children }: Part) => <>{children}</>
  const SelectItem = ({ children, value }: Part) => <option value={value}>{children}</option>
  const Select = ({ children, value, onValueChange }: SelectProps) => {
    const parts = React.Children.toArray(children)
    const content = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectContent,
    ) as React.ReactElement<Part> | undefined
    const trigger = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectTrigger,
    ) as React.ReactElement<Part> | undefined
    const valueNode = React.Children.toArray(trigger?.props.children).find(
      (part) => React.isValidElement(part) && part.type === SelectValue,
    ) as React.ReactElement<Part> | undefined
    return (
      <select
        id={trigger?.props.id}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        <option value="">{valueNode?.props.placeholder ?? 'Choose'}</option>
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

beforeEach(() => {
  access.profile = { ...access.profile, assignedProjectIds: ['project-a', 'project-b'] }
  // The API list returns slim rows for roles without projects.detail.read.
  api.getProjectsForRole.mockResolvedValue([
    { id: 'project-a', code: 'A', title: 'Alpha Project', status: 'ONGOING' },
    { id: 'project-b', code: 'B', title: 'Beta Project', status: 'PLANNED' },
  ])
  api.getDigitalForms.mockResolvedValue([])
  api.getActivities.mockResolvedValue([])
  api.getIndicators.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const projectSelect = () => screen.getByLabelText('Project selection') as HTMLSelectElement
const csvFile = (name: string, text: string) => {
  const file = new File(['test'], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { configurable: true, value: async () => text })
  return file
}
const attendance = {
  id: 'published-form',
  projectId: 'project-a',
  code: 'attendance',
  name: 'Attendance',
  version: 1,
  formType: 'OTHER',
  status: 'PUBLISHED',
  updatedAt: '2026-09-22T00:00:00Z',
  activityId: null,
  journeyStageId: null,
  fields: [
    {
      code: 'beneficiary_id',
      label: 'Beneficiary ID',
      dataType: 'TEXT',
      required: true,
      metadataKey: true,
      sadddField: false,
    },
  ],
}

describe('extend import project dropdown', () => {
  it.each([
    ['production rendering', false],
    ['development StrictMode (double-invoked effects)', true],
  ])('lists and selects the authorized projects in %s', async (_name, strict) => {
    const tree = (
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>
    )
    render(strict ? <StrictMode>{tree}</StrictMode> : tree)

    await waitFor(() =>
      expect(Array.from(projectSelect().options).map((option) => option.textContent)).toEqual(
        expect.arrayContaining(['Alpha Project', 'Beta Project']),
      ),
    )
    // The first authorized project is chosen by default, and another can be selected.
    await waitFor(() => expect(projectSelect().value).toBe('project-a'))
    fireEvent.change(projectSelect(), { target: { value: 'project-b' } })
    await waitFor(() => expect(projectSelect().value).toBe('project-b'))
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenLastCalledWith('project-b'))
  })

  it('retries a project response dropped by a generation bump instead of leaving the list empty', async () => {
    let calls = 0
    api.getProjectsForRole.mockImplementation(async () => {
      calls++
      const rows = [
        { id: 'project-a', code: 'A', title: 'Alpha Project', status: 'ONGOING' },
        { id: 'project-b', code: 'B', title: 'Beta Project', status: 'PLANNED' },
      ]
      // The first response lands after an auth refresh moved the sensitive-draft generation.
      if (calls === 1) clearSensitiveDraftStorage()
      return rows
    })
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect(Array.from(projectSelect().options).map((option) => option.textContent)).toEqual(
        expect.arrayContaining(['Alpha Project', 'Beta Project']),
      ),
    )
    expect(calls).toBe(2)
    await waitFor(() => expect(projectSelect().value).toBe('project-a'))
  })

  it('keeps the list after a later profile refetch and generation bump', async () => {
    const view = render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(projectSelect().value).toBe('project-a'))
    // Background `me` refetch: a fresh profile object for the same identity, plus a bump.
    access.profile = { ...access.profile, permissions: [...access.profile.permissions].reverse() }
    clearSensitiveDraftStorage()
    view.rerender(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect(Array.from(projectSelect().options).map((option) => option.textContent)).toEqual(
        expect.arrayContaining(['Alpha Project', 'Beta Project']),
      ),
    )
    fireEvent.change(projectSelect(), { target: { value: 'project-b' } })
    await waitFor(() => expect(projectSelect().value).toBe('project-b'))
  })

  it('stops retrying after three attempts and shows a notice instead of loading forever', async () => {
    api.getProjectsForRole.mockImplementation(async () => {
      clearSensitiveDraftStorage()
      return [{ id: 'project-a', code: 'A', title: 'Alpha Project', status: 'ONGOING' }]
    })
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await screen.findByText('Projects could not be loaded.')
    expect(api.getProjectsForRole).toHaveBeenCalledTimes(3)
    expect(screen.queryByText('Loading projects...')).toBeNull()
    expect(Array.from(projectSelect().options).map((option) => option.textContent)).toEqual([
      'No projects available',
    ])
  })

  it('shows a load failure as an error with Retry that reloads, never as a success notice', async () => {
    api.getProjectsForRole.mockRejectedValueOnce(new Error('Projects could not be loaded.'))
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await screen.findByText('Collection data could not be loaded')
    expect(screen.queryByText('Dismiss')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(projectSelect().value).toBe('project-a'))
    expect(api.getProjectsForRole).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Collection data could not be loaded')).toBeNull()
  })

  it('shows empty and error states in the saved forms list', async () => {
    api.getProjectsForRole.mockResolvedValue([])
    const first = render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="forms" />
      </DisplayLabelsProvider>,
    )
    await screen.findByText('None yet')
    first.unmount()
    api.getProjectsForRole.mockRejectedValue(new Error('Projects could not be loaded.'))
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="forms" />
      </DisplayLabelsProvider>,
    )
    await screen.findByText('Collection data could not be loaded')
    expect(screen.queryByText('None yet')).toBeNull()
  })

  it('shows the empty placeholder for an empty result', async () => {
    api.getProjectsForRole.mockResolvedValue([])
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect(projectSelect().options[0].textContent).toBe('No projects available'),
    )
  })

  it('never renders rows from an in-flight request after the assignments change', async () => {
    let releaseOld: (rows: unknown[]) => void = () => undefined
    api.getProjectsForRole.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseOld = resolve
        }),
    )
    const ui = () => (
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>
    )
    const view = render(ui())
    await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(1))
    // Assignments change (project-b removed) while the first request is still in flight.
    api.getProjectsForRole.mockResolvedValue([
      { id: 'project-a', code: 'A', title: 'Alpha Project', status: 'ONGOING' },
    ])
    access.profile = { ...access.profile, assignedProjectIds: ['project-a'] }
    view.rerender(ui())
    await waitFor(() =>
      expect(Array.from(projectSelect().options).map((option) => option.textContent)).toContain(
        'Alpha Project',
      ),
    )
    releaseOld([
      { id: 'project-b', code: 'B', title: 'Beta Project', status: 'PLANNED' },
      { id: 'project-a', code: 'A', title: 'Alpha Project', status: 'ONGOING' },
    ])
    await new Promise((resolve) => setTimeout(resolve, 20))
    const labels = Array.from(projectSelect().options).map((option) => option.textContent)
    expect(labels).not.toContain('Beta Project')
    expect(labels).toContain('Alpha Project')
  })

  it('keeps an initial project that is not the first one listed', async () => {
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="project-b"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect(Array.from(projectSelect().options).map((option) => option.textContent)).toContain(
        'Alpha Project',
      ),
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenLastCalledWith('project-b'))
    expect(projectSelect().value).toBe('project-b')
  })

  it('keeps the file preview when the current project is selected again', async () => {
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(projectSelect().value).toBe('project-a'))
    fireEvent.change(screen.getByLabelText('Source file'), {
      target: { files: [csvFile('extend.csv', 'beneficiary_id\nBEN-001')] },
    })
    await screen.findByText(/Preview ready for extend.csv/)
    fireEvent.change(projectSelect(), { target: { value: 'project-a' } })
    expect(screen.getByText(/Preview ready for extend.csv/)).toBeTruthy()
  })

  it('sends a column marked Ignored to the server mapping as ignored without a target', async () => {
    api.getDigitalForms.mockResolvedValue([attendance])
    api.uploadImport.mockResolvedValue({ id: 'batch-1', mappingRevision: 0 })
    api.automaticImportMapping.mockResolvedValue({ mappingRevision: 1 })
    api.getImportBatch.mockResolvedValue({
      sourceColumns: [
        { key: 'column_0001', columnIndex: 1, header: 'beneficiary_id' },
        { key: 'column_0002', columnIndex: 2, header: 'notes' },
      ],
      mappingRevision: 1,
    })
    api.saveImportMapping.mockResolvedValue({ id: 'batch-1', mappingRevision: 2 })
    api.validateImport.mockResolvedValue({
      id: 'batch-1',
      mappingRevision: 2,
      validationRevision: 1,
      totals: { rows: 1, valid: 1, invalid: 0, processed: 0, unprocessed: 1, failed: 0 },
    })
    api.processImport.mockResolvedValue({
      id: 'batch-1',
      status: 'PROCESSED',
      totals: { rows: 1, valid: 1, invalid: 0, processed: 1, unprocessed: 0, failed: 0 },
    })
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="import"
          initialProjectId="project-a"
          initialFormId="published-form"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance'),
    )
    fireEvent.change(screen.getByLabelText('Source file'), {
      target: { files: [csvFile('notes.csv', 'beneficiary_id,notes\nBEN-001,hello')] },
    })
    await screen.findByText(/Preview ready for notes.csv/)
    const row = screen.getByText('notes', { selector: 'span' }).closest('tr') as HTMLElement
    fireEvent.change(within(row).getAllByRole('combobox')[1], { target: { value: 'ignored' } })
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Proceed' }))
    await waitFor(() => expect(api.saveImportMapping).toHaveBeenCalled())
    expect(api.saveImportMapping.mock.calls[0]?.[3]).toEqual([
      { sourceFieldName: 'column_0001', targetFieldCode: 'beneficiary_id', ignored: false },
      { sourceFieldName: 'column_0002', targetFieldCode: undefined, ignored: true },
    ])
  })
})
