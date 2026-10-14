/* @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { CollectionWorkspace } from './collection-workspace'

const api = vi.hoisted(() => ({
  createDigitalForm: vi.fn(),
  createDigitalFormVersion: vi.fn(),
  generateDigitalForm: vi.fn(),
  publishDigitalForm: vi.fn(),
  updateDigitalForm: vi.fn(),
  uploadImport: vi.fn(),
  automaticImportMapping: vi.fn(),
  getImportBatch: vi.fn(),
  saveImportMapping: vi.fn(),
  validateImport: vi.fn(),
  processImport: vi.fn(),
  getActivities: vi.fn(),
  getDigitalForm: vi.fn(),
  getDigitalForms: vi.fn(),
  getIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
}))
const core = vi.hoisted(() => ({ downloadCoreArtifact: vi.fn() }))
const currentAccess = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  assignedProjectIds: ['futuremakers-ncr'],
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [
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
    ],
    assignedProjectIds: ['futuremakers-ncr'],
  },
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

vi.mock('@/providers/current-role-provider', () => ({
  useCurrentRole: () => currentAccess,
}))

vi.mock('@/lib/services/core-feature-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/core-feature-client')>()),
  downloadCoreArtifact: core.downloadCoreArtifact,
}))

vi.mock('@/lib/api/forms', () => ({
  formsClient: {
    getDigitalForms: api.getDigitalForms,
    createDigitalForm: api.createDigitalForm,
    createDigitalFormVersion: api.createDigitalFormVersion,
    generateDigitalForm: api.generateDigitalForm,
    publishDigitalForm: api.publishDigitalForm,
    updateDigitalForm: api.updateDigitalForm,
    getDigitalForm: api.getDigitalForm,
  },
}))
vi.mock('@/lib/api/imports', () => ({
  importsClient: {
    uploadImport: api.uploadImport,
    automaticImportMapping: api.automaticImportMapping,
    getImportBatch: api.getImportBatch,
    saveImportMapping: api.saveImportMapping,
    validateImport: api.validateImport,
    processImport: api.processImport,
  },
}))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: { getIndicators: api.getIndicators } }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: { getActivities: api.getActivities } }))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProjectsForRole: api.getProjectsForRole },
}))

beforeEach(() => {
  toasts.success.mockClear()
  sessionStorage.clear()
  currentAccess.profile.userId = 'actor-a'
  currentAccess.profile.organizationId = 'org-a'
  currentAccess.profile.assignedProjectIds = ['futuremakers-ncr']
  currentAccess.role = 'Monitoring and Evaluation Officer'
  currentAccess.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  currentAccess.profile.permissions = [
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
  api.getProjectsForRole.mockResolvedValue([{ id: 'futuremakers-ncr', title: 'Futuremakers NCR' }])
  api.getDigitalForms.mockResolvedValue([])
  api.getActivities.mockResolvedValue([])
  api.getIndicators.mockResolvedValue([])
  // Mirrors the real helper: bytes are saved only while the caller still owns the request.
  core.downloadCoreArtifact.mockImplementation(
    async (_url: string, _fileName: string, isOwnerCurrent: () => boolean) => {
      if (!isOwnerCurrent()) throw new Error('Artifact ownership changed.')
      URL.createObjectURL(new Blob(['artifact']))
      document.createElement('a').click()
    },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('collection import workspace', () => {
  it('shows the fetched project selection even when options arrive after the initial render', async () => {
    let resolveProjects: ((value: Array<{ id: string; title: string }>) => void) | undefined
    api.getProjectsForRole.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProjects = resolve
        }),
    )
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await act(async () => {
      resolveProjects?.([{ id: 'futuremakers-ncr', title: 'Futuremakers NCR' }])
    })
    const projectField = () => screen.getByText('Project selection').closest('div') as HTMLElement
    await waitFor(() =>
      expect(within(projectField()).getByRole('combobox').textContent).toContain(
        'Futuremakers NCR',
      ),
    )
  })

  it('shows the fetched projects again on a second mount (a cached list on remount)', async () => {
    api.getProjectsForRole.mockResolvedValue([
      { id: 'futuremakers-ncr', title: 'Futuremakers NCR' },
    ])
    const { unmount } = render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    unmount()
    api.getProjectsForRole.mockClear()

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalled())
    const projectField = () => screen.getByText('Project selection').closest('div') as HTMLElement
    await waitFor(() =>
      expect(within(projectField()).getByRole('combobox').textContent).toContain(
        'Futuremakers NCR',
      ),
    )
  })

  it('keeps the auto-selected project when the profile permission list is rebuilt in a different order', async () => {
    api.getProjectsForRole.mockResolvedValue([
      { id: 'futuremakers-ncr', title: 'Futuremakers NCR' },
      { id: 'second-project', title: 'Second Project' },
    ])
    const { rerender } = render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())

    const projectField = () => screen.getByText('Project selection').closest('div') as HTMLElement
    const trigger = () => within(projectField()).getByRole('combobox')
    await waitFor(() => expect(trigger().textContent).toContain('Futuremakers NCR'))

    // The auth layer rebuilds the permission list with the same permissions in a
    // different order (e.g. after a token refresh merges grants from two sources).
    // Because the permission set is unchanged, the workspace must not remount and
    // drop the already-selected project.
    currentAccess.profile.permissions = [...currentAccess.profile.permissions].reverse()
    rerender(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )

    expect(trigger().textContent).toContain('Futuremakers NCR')
  })
})

describe('collection permission integration', () => {
  it('keeps Project Officer on standard Import and avoids builder-only dependencies', async () => {
    currentAccess.role = 'Project Officer'
    currentAccess.profile.roles = ['PROJECT_OFFICER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'collection.read',
      'forms.read',
      'forms.export',
      'submissions.write',
      'imports.read',
      'imports.upload',
    ]

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace />
      </DisplayLabelsProvider>,
    )

    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    expect(screen.getByText('Import existing file')).toBeTruthy()
    expect(screen.queryByText('Build forms')).toBeNull()
    expect(screen.queryByText('Import then extend')).toBeNull()
    expect(api.getActivities).not.toHaveBeenCalled()
    expect(api.getIndicators).not.toHaveBeenCalled()
  })

  it('denies Program Manager form access even with stale legacy grants', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'monitoring.read',
      'collection.read',
      'forms.read',
      'forms.export',
    ]

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace />
      </DisplayLabelsProvider>,
    )

    await waitFor(() => expect(screen.queryByText('Build forms')).toBeNull())
    expect(api.getDigitalForms).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Forms' })).toBeNull()
    expect(screen.queryByText('Build forms')).toBeNull()
    expect(screen.queryByText('Import existing file')).toBeNull()
    expect(screen.queryByText('Import then extend')).toBeNull()
    expect(api.getActivities).not.toHaveBeenCalled()
    expect(api.getIndicators).not.toHaveBeenCalled()
  })
})
