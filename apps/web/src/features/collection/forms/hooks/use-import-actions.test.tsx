/* @vitest-environment jsdom */
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { CollectionWorkspace } from '../components/collection-workspace'

configure({ asyncUtilTimeout: 5000 })

const api = vi.hoisted(() => ({
  uploadImport: vi.fn(),
  automaticImportMapping: vi.fn(),
  getImportBatch: vi.fn(),
  saveImportMapping: vi.fn(),
  validateImport: vi.fn(),
  processImport: vi.fn(),
  getActivities: vi.fn(),
  getDigitalForms: vi.fn(),
  getIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [] as string[],
    assignedProjectIds: ['project-1'],
  },
}))
const allGrants = [
  'projects.read',
  'activities.read',
  'monitoring.read',
  'collection.read',
  'forms.read',
  'forms.manage',
  'imports.read',
  'imports.upload',
  'imports.review',
  'imports.validate',
  'imports.process',
]
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))
vi.mock('@/providers/current-role-provider', () => ({ useCurrentRole: () => access }))
vi.mock('@/lib/api/forms', () => ({ formsClient: { getDigitalForms: api.getDigitalForms } }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: { getIndicators: api.getIndicators } }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: { getActivities: api.getActivities } }))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProjectsForRole: api.getProjectsForRole },
}))

const attendance = {
  id: 'published-form',
  projectId: 'project-1',
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
const receipt = (over: object) => ({
  batchId: 'batch-1',
  mappingRevision: 1,
  mapped: 1,
  pending: 0,
  ignored: 0,
  requiredUnmapped: 0,
  complete: true,
  coverage: 'COVERED',
  uncoveredColumns: 0,
  unresolvedValues: 0,
  ...over,
})
const totals = {
  rows: 3,
  valid: 2,
  invalid: 1,
  processed: 0,
  unprocessed: 0,
  failed: 0,
  warnings: 0,
}
const csv = (name: string, text: string) => {
  const file = new File(['x'], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { configurable: true, value: async () => text })
  return file
}
const proceed = async () => {
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace
        initialMode="import"
        initialView="import"
        initialProjectId="project-1"
        initialFormId="published-form"
      />
    </DisplayLabelsProvider>,
  )
  await waitFor(() =>
    expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance'),
  )
  fireEvent.change(screen.getByLabelText('Source file'), {
    target: { files: [csv('people.csv', 'beneficiary_id\nA\nB\nC')] },
  })
  await screen.findByText(/Preview ready for/)
  fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Proceed' }))
}

describe('straight-through import', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    access.profile.permissions = [...allGrants]
    api.getProjectsForRole.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([attendance])
    api.getActivities.mockResolvedValue([])
    api.getIndicators.mockResolvedValue([])
    api.uploadImport.mockResolvedValue({
      id: 'batch-1',
      mappingRevision: 0,
      storageStatus: 'STORED',
    })
  })
  afterEach(cleanup)

  it('covered receipt validates and processes without saveImportMapping', async () => {
    api.automaticImportMapping.mockResolvedValue(receipt({}))
    api.validateImport.mockResolvedValue({
      id: 'batch-1',
      validationRevision: 2,
      status: 'VALIDATED',
      totals,
    })
    api.processImport.mockResolvedValue({
      id: 'batch-1',
      status: 'PROCESSED',
      totals: { ...totals, processed: 1, unprocessed: 1, warnings: 1 },
    })
    await proceed()
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(
        'Imported 1. 1 held for review, 1 invalid, 1 with warnings.',
      ),
    )
    expect(api.getImportBatch).not.toHaveBeenCalled()
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    expect(api.validateImport).toHaveBeenCalledWith('project-1', 'batch-1', 1)
    expect(api.processImport).toHaveBeenCalledWith('project-1', 'batch-1', 2)
  })

  it('not covered stops before validate and shows the counts', async () => {
    api.automaticImportMapping.mockResolvedValue(
      receipt({
        coverage: 'NOT_COVERED',
        complete: false,
        mapped: 0,
        pending: 3,
        uncoveredColumns: 3,
        unresolvedValues: 12,
      }),
    )
    await proceed()
    await screen.findByText(/Form needs updating: 3 columns, 12 answers/)
    expect(api.validateImport).not.toHaveBeenCalled()
    expect(api.processImport).not.toHaveBeenCalled()
    expect(api.saveImportMapping).not.toHaveBeenCalled()
  })

  it('stages a covered file for a user who cannot validate and process', async () => {
    access.profile.permissions = allGrants.filter((grant) => grant !== 'imports.process')
    api.automaticImportMapping.mockResolvedValue(receipt({}))
    await proceed()
    await screen.findByText(/was staged/)
    expect(api.validateImport).not.toHaveBeenCalled()
  })
})
