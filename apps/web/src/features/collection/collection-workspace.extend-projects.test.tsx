/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))

// Radix Select cannot open in jsdom without hanging on a page this large, so the trigger and
// options are rendered as a native select. The option list is what the test asserts.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type Part = { children?: React.ReactNode; value?: string }
  type SelectProps = Part & { onValueChange?: (value: string) => void }
  const SelectTrigger = (_props: Part) => null
  const SelectValue = (_props: Part) => null
  const SelectContent = ({ children }: Part) => <>{children}</>
  const SelectItem = ({ children, value }: Part) => <option value={value}>{children}</option>
  const Select = ({ children, value, onValueChange }: SelectProps) => {
    const content = React.Children.toArray(children).find(
      (part) => React.isValidElement(part) && part.type === SelectContent,
    ) as React.ReactElement<Part> | undefined
    return (
      <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
        <option value="">Choose</option>
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

beforeEach(() => {
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

const projectSelect = () =>
  screen.getByText('Project selection').closest('div')?.querySelector('select') as HTMLSelectElement

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
})
