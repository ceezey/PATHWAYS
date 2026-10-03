/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectPhaseFiveWorkspace } from './project-review-workspace'

const projectId = '72000000-0000-4000-8000-000000000004'
const coreApi = vi.hoisted(() => ({ reports: vi.fn() }))
const api = vi.hoisted(() => ({
  getEvidence: vi.fn(),
  getProject: vi.fn(),
  getProjectIndicators: vi.fn(),
}))
const proofClient = vi.hoisted(() => ({
  context: vi.fn(),
  inspect: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    organizationId: '10000000-0000-4000-8000-000000000001',
    userId: '60000000-0000-4000-8000-000000000006',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['projects.read', 'evidence.read', 'evidence.review', 'reports.read'],
    assignedProjectIds: ['72000000-0000-4000-8000-000000000004'],
  },
}))

const { MockPathwaysClientError } = vi.hoisted(() => {
  class MockPathwaysClientError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly fieldErrors: unknown[] = [],
      readonly status?: number,
    ) {
      super(message)
      this.name = 'PathwaysClientError'
    }
  }
  return { MockPathwaysClientError }
})

vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: api,
  PathwaysClientError: MockPathwaysClientError,
}))
vi.mock('@/lib/services/private-proof-client', () => ({ privateProofClient: proofClient }))
vi.mock('@/lib/services/core-feature-client', () => ({ coreDataClient: coreApi }))
vi.mock('./budget-module/budget-module', () => ({
  BudgetModule: ({ projectId }: { projectId: string }) => <div>Finance for {projectId}</div>,
}))
vi.mock('./live-evaluation-workspace', () => ({
  LiveEvaluationWorkspace: ({ projectId }: { projectId: string }) => (
    <div>Evaluation for {projectId}</div>
  ),
}))
vi.mock('./project-rules-panel', () => ({
  ProjectRulesPanel: ({ projectId }: { projectId: string }) => <div>Rules for {projectId}</div>,
}))
vi.mock('@/features/public/publication-queue-workspace', () => ({
  PublicationQueueWorkspace: ({ initialProjectId }: { initialProjectId: string }) => (
    <div>Publication for {initialProjectId}</div>
  ),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => access,
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({
    labels: {
      projectWorkspace: 'Project workspace',
      projectEvidence: 'Evidence',
      projectIndicators: 'Indicators',
      projectMonitorEvaluate: 'Monitor & Evaluate',
      projectBudget: 'Budget',
      projectPublicDashboard: 'Transparency',
    },
  }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('./project-workspace-header', () => ({
  ProjectWorkspaceHeader: () => <nav>Project tabs</nav>,
}))

describe('shared project workspace optional loading', () => {
  beforeEach(() => {
    access.role = 'Monitoring and Evaluation Officer'
    access.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
    access.profile.assignedProjectIds = [projectId]
    access.profile.permissions = [
      'projects.read',
      'activities.read',
      'evidence.read',
      'evidence.review',
      'reports.read',
    ]
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Project Alpha',
      metricsAvailable: true,
    })
    api.getEvidence.mockRejectedValue(new Error('not_configured'))
    coreApi.reports.mockResolvedValue([])
    api.getProjectIndicators.mockResolvedValue([])
    proofClient.context.mockReset()
    proofClient.inspect.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps an authorized view usable when one optional service is unavailable', async () => {
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)

    expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeTruthy()
    expect(await screen.findByText('Some information is unavailable')).toBeTruthy()
    expect(screen.getByText('Evidence records')).toBeTruthy()
    expect(screen.getByText('No evidence records are available for this project.')).toBeTruthy()
    await waitFor(() => expect(coreApi.reports).toHaveBeenCalledWith(projectId))
  })
  it('dispatches each live workspace with the exact project ID', () => {
    const finance = render(<ProjectPhaseFiveWorkspace projectId={projectId} view="budget" />)
    expect(screen.getByText(`Finance for ${projectId}`)).toBeTruthy()
    expect(screen.getByText(`Rules for ${projectId}`)).toBeTruthy()
    finance.unmount()
    const evaluation = render(
      <ProjectPhaseFiveWorkspace projectId={projectId} view="monitor-evaluate" />,
    )
    expect(screen.getByText(`Evaluation for ${projectId}`)).toBeTruthy()
    evaluation.unmount()
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="transparency" />)
    expect(screen.getByText(`Publication for ${projectId}`)).toBeTruthy()
    expect(api.getProject).not.toHaveBeenCalled()
  })
  it.each([false, undefined])(
    'does not block existing authorized evidence content for metric availability %s',
    async (metricsAvailable) => {
      api.getProject.mockResolvedValue({ id: projectId, title: 'Project Alpha', metricsAvailable })
      api.getEvidence.mockResolvedValue({ scope: 'detail', records: [] })
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
      expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeTruthy()
      expect(
        await screen.findByText('No evidence records are available for this project.'),
      ).toBeTruthy()
      await waitFor(() => expect(api.getEvidence).toHaveBeenCalledWith(projectId))
      expect(screen.queryByRole('heading', { name: 'Workspace unavailable' })).toBeNull()
    },
  )
  it('preserves current permission-driven optional reads with unavailable metrics', async () => {
    access.profile.permissions = ['projects.read', 'evidence.review']
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Project Alpha',
      metricsAvailable: false,
    })
    api.getEvidence.mockResolvedValue({ scope: 'detail', records: [] })
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeTruthy()
    expect(coreApi.reports).not.toHaveBeenCalled()
  })
  it('keeps failed project authorization authoritative and does not read children', async () => {
    api.getProject.mockRejectedValue(new Error('Project unavailable.'))
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByRole('heading', { name: 'Workspace unavailable' })).toBeTruthy()
    expect(api.getEvidence).not.toHaveBeenCalled()
    expect(coreApi.reports).not.toHaveBeenCalled()
  })
  it.each(['indicators'] as const)(
    'loads existing authorized %s content without metric availability',
    async (view) => {
      access.profile.permissions = ['projects.read', 'monitoring.read']
      api.getProject.mockResolvedValue({
        id: projectId,
        title: 'Project Alpha',
        metricsAvailable: false,
      })
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view={view} />)
      expect(
        await screen.findByRole('heading', {
          name: 'Indicators',
        }),
      ).toBeTruthy()
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalledWith(projectId))
      expect(screen.queryByRole('heading', { name: 'Workspace unavailable' })).toBeNull()
    },
  )
  const proofId = '72000000-0000-4000-8000-000000000005'
  const activityId = '72000000-0000-4000-8000-000000000006'
  const updateId = '72000000-0000-4000-8000-000000000007'
  const proof = {
    id: proofId,
    projectId,
    activityId,
    updateId,
    status: 'Submitted',
    fileName: 'synthetic.pdf',
    reportTitle: 'Activity proof',
    submittedDate: '2026-01-01',
    submitter: 'Synthetic staff',
    previewSummary: 'Submitted proof',
    contentType: 'application/pdf',
    byteSize: 2411724,
    isIdentifying: false,
    reviewedDate: null,
    reviewer: null,
  }
  const proofContext = {
    activityId,
    updateId,
    expectedActivityUpdatedAt: '2026-01-01T00:00:00.000Z',
    expectedUpdateUpdatedAt: '2026-01-01T00:00:00.000Z',
    proofs: [
      {
        id: proofId,
        label: 'Activity proof',
        expectedEvidenceUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  }
  const reviewerPermissions = [
    'projects.read',
    'activities.read',
    'evidence.read',
    'evidence.review',
  ]
  it('routes the eligible assigned reviewer to the real activity proof workflow instead of dead status controls', async () => {
    access.profile.permissions = reviewerPermissions
    api.getEvidence.mockResolvedValue({ scope: 'detail', records: [proof] })
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    const link = await screen.findByRole('link', { name: 'Review proof' })
    expect(link.getAttribute('href')).toBe(
      `/projects/${projectId}/activities/${activityId}?review=${proofId}`,
    )
    for (const name of ['Validate', 'Flag', 'Approve', 'Return for Revision'])
      expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getByRole('button', { name: 'Download for review' })).toBeTruthy()
  })
  it('renders evidence rows with icon, size, uploader, date, status and View', async () => {
    access.profile.permissions = reviewerPermissions
    api.getEvidence.mockResolvedValue({
      scope: 'detail',
      records: [
        proof,
        {
          ...proof,
          id: 'img',
          fileName: 'photos.png',
          contentType: 'image/png',
          byteSize: 512,
          status: 'Approved',
          reviewedDate: '2026-01-03',
          reviewer: 'Synthetic reviewer',
        },
        { ...proof, id: 'lock', fileName: 'private.pdf', isIdentifying: true, status: 'Returned' },
      ],
    })
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByText('Evidence & attachments')).toBeTruthy()
    expect(screen.getByText('synthetic.pdf')).toBeTruthy()
    expect(screen.getAllByText(/2\.3 MB · Uploaded by Synthetic staff/)).toHaveLength(2)
    expect(screen.getByText(/512 B · Uploaded by/)).toBeTruthy()
    expect(screen.getByText('Needs review')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Returned')).toBeTruthy()
    expect(document.querySelectorAll('[data-testid="evidence-icon"] svg')).toHaveLength(3)
    expect(screen.getAllByText('View')).toHaveLength(3)
    expect(screen.getByText('Audit metadata')).toBeTruthy()
    expect(screen.getByText('Evidence approved')).toBeTruthy()
    expect(screen.getByText(/Synthetic reviewer/)).toBeTruthy()
    expect(screen.getAllByText('Evidence uploaded')).toHaveLength(3)
  })
  it('shows the audit empty state without evidence records', async () => {
    access.profile.permissions = reviewerPermissions
    api.getEvidence.mockResolvedValue({ scope: 'detail', records: [] })
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByText('No audit events')).toBeTruthy()
    expect(screen.getByText('No evidence records')).toBeTruthy()
  })
  it.each(['Project Officer', 'Project Manager'])(
    'preserves %s read-only evidence without dead approval controls',
    async (role) => {
      access.role = role
      access.profile.roles = [role === 'Project Officer' ? 'PROJECT_OFFICER' : 'PROJECT_MANAGER']
      access.profile.permissions = reviewerPermissions
      api.getEvidence.mockResolvedValue({ scope: 'detail', records: [proof] })
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
      expect(await screen.findByRole('button', { name: 'Not available yet' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Download for review' })).toBeNull()
      expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    },
  )
  it('does not advertise a review workflow after current evidence.review revocation', async () => {
    access.profile.permissions = reviewerPermissions.filter((value) => value !== 'evidence.review')
    api.getEvidence.mockResolvedValue({ scope: 'detail', records: [proof] })
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByRole('button', { name: 'Not available yet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download for review' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
  })
  it('fetches evidence with evidence.read alone but keeps download disabled without activities.read', async () => {
    access.profile.permissions = reviewerPermissions.filter((value) => value !== 'activities.read')
    api.getEvidence.mockResolvedValue({ scope: 'detail', records: [proof] })
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByRole('button', { name: 'Not available yet' })).toBeTruthy()
    expect(api.getEvidence).toHaveBeenCalledWith(projectId)
  })
  it.each([
    ['Program Manager', 'PROGRAM_MANAGER'],
    ['Grant Manager', 'GRANT_MANAGER'],
  ])('renders only aggregate evidence counts for %s', async (role, code) => {
    access.role = role
    access.profile.roles = [code]
    access.profile.permissions = ['projects.read', 'evidence.read']
    api.getEvidence.mockResolvedValue({
      scope: 'aggregate',
      activities: [
        {
          activityId,
          activityTitle: 'Synthetic activity',
          total: 3,
          submitted: 1,
          approved: 1,
          returned: 1,
        },
      ],
    })
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByText('Activity evidence summary')).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: 'Synthetic activity' })).toBeTruthy()
    expect(screen.queryByText('Activity evidence list')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download for review' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Not available yet' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
    expect(screen.queryByText('Submitter')).toBeNull()
  })
  it('does not fetch or offer download for evidence after current evidence.read revocation', async () => {
    access.profile.permissions = reviewerPermissions.filter((value) => value !== 'evidence.read')
    api.getEvidence.mockResolvedValue({ scope: 'detail', records: [proof] })
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeTruthy()
    expect(api.getEvidence).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Download for review' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Not available yet' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
  })
  it.each(['unassigned', 'already-reviewed', 'foreign-record'])(
    'does not offer download for %s evidence',
    async (condition) => {
      access.profile.permissions = reviewerPermissions
      if (condition === 'unassigned') access.profile.assignedProjectIds = []
      api.getEvidence.mockResolvedValue({
        scope: 'detail',
        records: [
          {
            ...proof,
            ...(condition === 'foreign-record'
              ? { projectId: '72000000-0000-4000-8000-000000000099' }
              : {}),
            ...(condition === 'already-reviewed' ? { status: 'Approved' } : {}),
          },
        ],
      })
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
      expect(await screen.findByRole('button', { name: 'Not available yet' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Download for review' })).toBeNull()
      expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
    },
  )

  describe('server-authorized download control', () => {
    beforeEach(() => {
      access.profile.permissions = reviewerPermissions
      api.getEvidence.mockResolvedValue({ scope: 'detail', records: [proof] })
    })

    it('loads and downloads the file without rendering it inline, then revokes the object URL', async () => {
      const blob = new Blob(['synthetic-bytes'], { type: 'application/octet-stream' })
      proofClient.context.mockResolvedValue(proofContext)
      proofClient.inspect.mockResolvedValue(blob)
      const createObjectURL = vi.fn().mockReturnValue('blob:synthetic')
      const revokeObjectURL = vi.fn()
      const originalCreate = URL.createObjectURL
      const originalRevoke = URL.revokeObjectURL
      URL.createObjectURL = createObjectURL
      URL.revokeObjectURL = revokeObjectURL
      try {
        render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
        const button = await screen.findByRole('button', { name: 'Download for review' })
        fireEvent.click(button)
        await waitFor(() => expect(proofClient.inspect).toHaveBeenCalled())
        await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob))
        await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic'))
        expect(proofClient.context).toHaveBeenCalledWith(projectId, activityId, updateId)
        // No inline rendering: no <img>/<iframe>/<embed> is created from the retrieved bytes.
        expect(document.querySelector('img[src^="blob:"]')).toBeNull()
        expect(document.querySelector('iframe[src^="blob:"]')).toBeNull()
        expect(document.querySelector('embed[src^="blob:"]')).toBeNull()
      } finally {
        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
      }
    })

    it('shows the ineligible reviewer a disabled control instead of a download', async () => {
      access.profile.permissions = reviewerPermissions.filter(
        (value) => value !== 'evidence.review',
      )
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
      const button = await screen.findByRole('button', { name: 'Not available yet' })
      expect(button).toBeTruthy()
      expect(button.hasAttribute('disabled')).toBe(true)
      expect(proofClient.context).not.toHaveBeenCalled()
    })

    it('surfaces the server denial message on a 403 without downloading', async () => {
      proofClient.context.mockResolvedValue(proofContext)
      proofClient.inspect.mockRejectedValue(
        new MockPathwaysClientError('Private inspection is not authorized.', 'forbidden', [], 403),
      )
      const createObjectURL = vi.fn()
      const originalCreate = URL.createObjectURL
      URL.createObjectURL = createObjectURL
      try {
        render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
        const button = await screen.findByRole('button', { name: 'Download for review' })
        fireEvent.click(button)
        expect(await screen.findByText('Private inspection is not authorized.')).toBeTruthy()
        expect(createObjectURL).not.toHaveBeenCalled()
      } finally {
        URL.createObjectURL = originalCreate
      }
    })
  })
})
