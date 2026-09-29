// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectDetail, UserRecord } from '@/types/pathways'

import { ProjectTeamEditorDialog } from './project-team-editor-dialog'

const api = vi.hoisted(() => ({
  getUsers: vi.fn(),
  updateProject: vi.fn(),
  getProject: vi.fn(),
}))

let access: {
  profile: {
    organizationId: string
    userId: string
    roles: string[]
    permissions: string[]
    assignedProjectIds: string[]
  }
}

vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: api,
  PathwaysClientError: class extends Error {},
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/hooks/use-source-mutation-context', () => ({
  useSourceMutationContext: () => ({
    isCurrent: () => true,
    context: {},
  }),
}))
vi.mock('./source-mutation-recovery', () => ({ SourceMutationRecovery: () => null }))

const projectManagerUser: UserRecord = {
  id: '60000000-0000-4000-8000-000000000010',
  name: 'Pat Manager',
  email: 'pat@pathways.test',
  role: 'Project Manager',
  accountStatus: 'Active',
  signInMethod: 'Supabase account',
  projectIds: [],
  projectAccess: [],
  createdAt: '2026-09-01T00:00:00.000Z',
}

const meOfficerUser: UserRecord = {
  id: '60000000-0000-4000-8000-000000000011',
  name: 'Mo Officer',
  email: 'mo@pathways.test',
  role: 'Monitoring and Evaluation Officer',
  accountStatus: 'Active',
  signInMethod: 'Supabase account',
  projectIds: [],
  projectAccess: [],
  createdAt: '2026-09-01T00:00:00.000Z',
}

const projectOfficerUser: UserRecord = {
  id: '60000000-0000-4000-8000-000000000012',
  name: 'Ollie Officer',
  email: 'ollie@pathways.test',
  role: 'Project Officer',
  accountStatus: 'Active',
  signInMethod: 'Supabase account',
  projectIds: [],
  projectAccess: [],
  createdAt: '2026-09-01T00:00:00.000Z',
}

const project: ProjectDetail = {
  id: '72000000-0000-4000-8000-000000000004',
  title: 'Community project',
  area: 'Navotas',
  sector: 'Sector not recorded',
  status: 'Planned',
  storedStatus: 'PLANNED',
  health: 'On Track',
  period: '2026-08-01 - 2026-12-01',
  projectManager: 'Pat Manager',
  programManager: 'Not assigned',
  monitoringOfficer: 'Mo Officer',
  projectOfficers: [],
  budgetCode: 'Not recorded',
  updatedAt: '2026-09-23T00:00:00.000Z',
  description: '',
  targetBeneficiaries: 0,
}

const openDialog = async () => {
  render(<ProjectTeamEditorDialog onUpdated={vi.fn()} project={project} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit team' }))
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Save assignments' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  )
}

beforeEach(() => {
  api.getUsers.mockResolvedValue([projectManagerUser, meOfficerUser, projectOfficerUser])
  api.updateProject.mockResolvedValue({ ...project })
  access = {
    profile: {
      organizationId: '10000000-0000-4000-8000-000000000001',
      userId: '60000000-0000-4000-8000-000000000099',
      roles: ['PROGRAM_MANAGER'],
      permissions: ['projects.update'],
      assignedProjectIds: [project.id],
    },
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProjectTeamEditorDialog', () => {
  it('saves team changes for a project with an empty description', async () => {
    // No eligible users for any role: the team fields stay blank/unchanged
    // (matching the loaded project), isolating this test to the
    // description/objectives relaxation this case is actually about.
    api.getUsers.mockResolvedValue([])
    await openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }))

    await waitFor(() => expect(api.updateProject).toHaveBeenCalled())
    const [, payload] = api.updateProject.mock.calls[0]
    expect(payload.description).toBe('')
  })

  it('keeps existing PM and M&E assignments visible after the directory loads, and saves without clearing them', async () => {
    await openDialog()

    // The stored assignments must still be showing once the eligible-user
    // list has loaded (regression: getUsers() resolving after mount used to
    // reset these fields to blank even though the stored name matched an
    // eligible active user).
    expect(screen.getByLabelText('Project Manager').textContent).toContain('Pat Manager')
    expect(screen.getByLabelText('Monitoring and Evaluation Officer').textContent).toContain(
      'Mo Officer',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }))

    await waitFor(() => expect(api.updateProject).toHaveBeenCalled())
    const [, payload] = api.updateProject.mock.calls[0]
    expect(payload).not.toHaveProperty('projectManagerId', null)
    expect(payload).not.toHaveProperty('monitoringOfficerId', null)
    expect(payload.projectManagerId).toBe(projectManagerUser.id)
    expect(payload.monitoringOfficerId).toBe(meOfficerUser.id)
  })

  // "Explicitly choosing None sends null, and only for the touched field" is
  // covered at the toProjectTeamInput unit level in
  // project-form-validation.test.ts ("with dirtyFields, only nulls a blank
  // role the actor actually touched"). Driving that same save through a
  // real, opened Radix <Select> in this jsdom suite reproducibly hangs
  // during unmount/cleanup — unrelated to this fix — so it is intentionally
  // not exercised as a full dialog interaction here.

  it('lets a Program Manager assign Project Manager and M&E, but not Project Officer', async () => {
    access.profile.roles = ['PROGRAM_MANAGER']
    await openDialog()

    const projectManagerSelect = screen.getByLabelText('Project Manager')
    const monitoringSelect = screen.getByLabelText('Monitoring and Evaluation Officer')
    const officerButton = screen.getByRole('button', { name: /Project Officer/ })

    expect(projectManagerSelect.hasAttribute('data-disabled')).toBe(false)
    expect(monitoringSelect.hasAttribute('data-disabled')).toBe(false)
    expect((officerButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('lets a Project Manager assign Project Officer and M&E, but not Project Manager', async () => {
    access.profile.roles = ['PROJECT_MANAGER']
    await openDialog()

    const projectManagerSelect = screen.getByLabelText('Project Manager')
    const monitoringSelect = screen.getByLabelText('Monitoring and Evaluation Officer')
    const officerButton = screen.getByRole('button', { name: /Project Officer/ })

    expect(projectManagerSelect.hasAttribute('data-disabled')).toBe(true)
    expect(monitoringSelect.hasAttribute('data-disabled')).toBe(false)
    expect((officerButton as HTMLButtonElement).disabled).toBe(false)
  })
})
