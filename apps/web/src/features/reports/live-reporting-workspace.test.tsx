import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LiveReportingWorkspace,
  allowedKinds,
  kinds,
  reportFileName,
} from './live-reporting-workspace'
import { sampleProjectReport } from './print/print-report-sample'

const state = vi.hoisted(() => ({
  user: 'reviewer-1',
  project: '10000000-0000-4000-8000-000000000001',
  title: 'Recorded project',
  generate: vi.fn(),
  downloadArtifact: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  refetch: vi.fn(),
  projectsError: false,
  projectsPending: false,
  formsError: false,
  formsPending: false,
  previewError: false,
  sections: undefined as unknown,
  reportsError: false,
  native: false,
  rounds: [] as unknown[],
  savedEvaluation: null as unknown,
  preview: vi.fn(),
  permissions: [
    'reports.read',
    'reports.project.read',
    'reports.generate',
    'reports.export',
    'forms.read',
    'assessments.read',
  ] as string[],
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'org',
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: state.permissions,
      assignedProjectIds: [state.project],
    },
  }),
}))
vi.mock('@/lib/services/core-feature-client', () => ({
  coreDataClient: {
    generateReport: (...args: unknown[]) => state.generate(...args),
    reportPreview: (...args: unknown[]) => state.preview(...args),
  },
  downloadCoreArtifact: (...args: unknown[]) => state.downloadArtifact(...args),
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: { getProjects: vi.fn() } }))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: (
    key: string,
    _id: unknown,
    _permission: unknown,
    fetcher?: (signal?: AbortSignal) => unknown,
  ) => {
    if (key.startsWith('report-preview')) void fetcher?.()
    return {
      // Keep cached data present even on denial: the real screen must gate it.
      data:
        key === 'report-projects'
          ? [{ id: state.project, title: state.title }]
          : key === 'report-evaluation-rounds'
            ? state.rounds
            : key === 'report-survey-forms'
              ? [
                  {
                    id: '20000000-0000-4000-8000-000000000002',
                    name: 'Private survey title',
                    code: 'SURVEY',
                    version: 1,
                  },
                ]
              : key.startsWith('report-preview')
                ? {
                    projectId: state.project,
                    formId: key.includes('SURVEY_FORM_RESULTS')
                      ? '20000000-0000-4000-8000-000000000002'
                      : null,
                    kind: key.includes('SURVEY_FORM_RESULTS')
                      ? 'SURVEY_FORM_RESULTS'
                      : 'PROJECT_SUMMARY',
                    columns: ['Title'],
                    rows: [['Private report cell']],
                    ...(state.sections ? { sections: state.sections } : {}),
                    generatedAt: '2026-09-27T00:00:00Z',
                    unavailableReasons: [],
                  }
                : [
                    {
                      id: '30000000-0000-4000-8000-000000000003',
                      name: 'Private saved report',
                      format: 'PDF',
                      status: 'GENERATED',
                      evaluation: state.savedEvaluation,
                    },
                  ],
      isPending:
        key === 'report-projects'
          ? state.projectsPending
          : key === 'report-survey-forms' && state.formsPending,
      isError:
        key === 'report-projects'
          ? state.projectsError
          : key === 'report-survey-forms'
            ? state.formsError
            : key.startsWith('report-preview')
              ? state.previewError
              : state.reportsError,
      refetch: state.refetch,
    }
  },
}))
// Radix popups hang jsdom after a selection, so the round tests swap in native selects.
vi.mock('@/components/ui/select', async (original) => {
  const actual = await original<typeof import('@/components/ui/select')>()
  const pick =
    <P extends object>(Real: React.ComponentType<P>, Fake: React.ComponentType<P>) =>
    (props: P) =>
      state.native ? <Fake {...props} /> : <Real {...props} />
  type Root = React.ComponentProps<typeof actual.Select>
  type Item = React.ComponentProps<typeof actual.SelectItem>
  return {
    ...actual,
    Select: pick<Root>(actual.Select, ({ value, onValueChange, disabled, children }) => (
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        {children}
      </select>
    )),
    SelectTrigger: pick<object>(actual.SelectTrigger as never, () => null),
    SelectValue: pick<object>(actual.SelectValue as never, () => null),
    SelectContent: pick<{ children?: React.ReactNode }>(
      actual.SelectContent as never,
      ({ children }) => <>{children}</>,
    ),
    SelectItem: pick<Item>(actual.SelectItem, ({ value, children }) => (
      <option value={value}>{children}</option>
    )),
  }
})
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => state.success(...args),
    error: (...args: unknown[]) => state.error(...args),
  },
}))
describe('report generation owned retries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'reviewer-1'
    state.project = '10000000-0000-4000-8000-000000000001'
    state.title = 'Recorded project'
    state.sections = undefined
    state.refetch.mockResolvedValue(undefined)
    state.downloadArtifact.mockResolvedValue(undefined)
    state.projectsError = false
    state.projectsPending = false
    state.formsError = false
    state.formsPending = false
    state.previewError = false
    state.reportsError = false
    state.permissions = [
      'reports.read',
      'reports.project.read',
      'reports.generate',
      'reports.export',
      'forms.read',
      'assessments.read',
    ]
  })
  afterEach(cleanup)
  it('retries the same normalized request after response loss and rotates after acknowledged completion', async () => {
    state.generate
      .mockRejectedValueOnce(Error('Response lost'))
      .mockResolvedValue({ id: 'report', status: 'GENERATED' })
    render(<LiveReportingWorkspace initialKind="project-summary" />)
    const button = screen.getByRole('button', { name: 'Generate private report' })
    fireEvent.click(button)
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce())
    fireEvent.click(button)
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.generate.mock.calls[1][1]).toEqual(state.generate.mock.calls[0][1])
    fireEvent.click(button)
    await waitFor(() => expect(state.generate).toHaveBeenCalledTimes(3))
    expect(state.generate.mock.calls[2][1].clientRequestId).not.toBe(
      state.generate.mock.calls[1][1].clientRequestId,
    )
  })
  it.each(['identity', 'generation'] as const)(
    'clears a private name and pending busy state on %s change and ignores the old completion',
    async (boundary) => {
      let finish: (value: unknown) => void = () => {}
      state.generate.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      const view = render(<LiveReportingWorkspace initialKind="project-summary" />)
      fireEvent.change(screen.getByLabelText('Report name'), {
        target: { value: 'Prior actor private name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))
      expect(screen.getByRole('button', { name: 'Generating' }).hasAttribute('disabled')).toBe(true)
      if (boundary === 'identity') state.user = 'reviewer-2'
      else act(() => clearSensitiveDraftStorage())
      view.rerender(<LiveReportingWorkspace initialKind="project-summary" />)
      await waitFor(() =>
        expect((screen.getByLabelText('Report name') as HTMLInputElement).value).toBe(''),
      )
      expect(
        screen.getByRole('button', { name: 'Generate private report' }).hasAttribute('disabled'),
      ).toBe(false)
      await act(async () => finish({ id: 'old-report', status: 'GENERATED' }))
      expect(state.success).not.toHaveBeenCalled()
      expect(state.refetch).not.toHaveBeenCalled()
    },
  )
  it('changes request identity for edited normalized content after uncertain failure', async () => {
    state.generate.mockRejectedValue(Error('Response lost'))
    render(<LiveReportingWorkspace initialKind="project-summary" />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByLabelText('Report name'), {
      target: { value: 'Different report' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))
    await waitFor(() => expect(state.generate).toHaveBeenCalledTimes(2))
    expect(state.generate.mock.calls[1][1].clientRequestId).not.toBe(
      state.generate.mock.calls[0][1].clientRequestId,
    )
  })
  it('bounds a default name for a long valid project title while preserving the report kind', async () => {
    state.title = 'Project title '.repeat(20).slice(0, 200)
    state.generate.mockResolvedValue({ id: 'report', status: 'GENERATED' })
    render(<LiveReportingWorkspace initialKind="project-summary" />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.generate.mock.calls[0][1].name.length).toBe(200)
    expect(state.generate.mock.calls[0][1].name).toMatch(/^Project title /)
    expect(state.generate.mock.calls[0][1].name.endsWith(' Project summary')).toBe(true)
  })
  it('renders the status layout instead of the plain table when sections are present', () => {
    state.sections = sampleProjectReport.sections
    render(<LiveReportingWorkspace initialKind="project-summary" />)
    expect(screen.getByRole('heading', { name: 'Key figures' })).toBeTruthy()
    expect(screen.getAllByText('OFF TRACK').length).toBeGreaterThan(0)
    expect(screen.queryByText('Private report cell')).toBeNull()
  })
  it.each(['error', 'pending'] as const)(
    'hides cached parent projects and all dependent private report data on %s',
    async (boundary) => {
      const view = render(<LiveReportingWorkspace initialKind="project-summary" />)
      expect(screen.getByText('Private report cell')).toBeTruthy()
      expect(screen.getByText('Private saved report')).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Report name'), {
        target: { value: 'Private draft name' },
      })
      state.projectsError = boundary === 'error'
      state.projectsPending = boundary === 'pending'
      view.rerender(<LiveReportingWorkspace initialKind="project-summary" />)
      expect(screen.queryByText('Recorded project')).toBeNull()
      expect(screen.queryByText('Private report cell')).toBeNull()
      expect(screen.queryByText('Private saved report')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Generate private report' }).hasAttribute('disabled'),
      ).toBe(true)
      await waitFor(() =>
        expect((screen.getByLabelText('Report name') as HTMLInputElement).value).toBe(''),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))
      expect(state.generate).not.toHaveBeenCalled()
    },
  )
  it.each(['error', 'pending'] as const)(
    'hides cached survey choices, preview and artifacts when form verification is %s',
    (boundary) => {
      const view = render(<LiveReportingWorkspace initialKind="survey-results" />)
      expect(screen.getByText('Private survey title · version 1')).toBeTruthy()
      expect(screen.getByText('Private report cell')).toBeTruthy()
      state.formsError = boundary === 'error'
      state.formsPending = boundary === 'pending'
      view.rerender(<LiveReportingWorkspace initialKind="survey-results" />)
      expect(screen.queryByText('Private survey title · version 1')).toBeNull()
      expect(screen.queryByText('Private report cell')).toBeNull()
      expect(screen.queryByText('Private saved report')).toBeNull()
      if (boundary === 'error') expect(screen.getByText('Survey access unavailable')).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Generate private report' }).hasAttribute('disabled'),
      ).toBe(true)
    },
  )
  it('drops a pending generation completion after parent denial and resets busy/name', async () => {
    let finish: (value: unknown) => void = () => {}
    state.generate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<LiveReportingWorkspace initialKind="project-summary" />)
    fireEvent.change(screen.getByLabelText('Report name'), {
      target: { value: 'Old private name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))
    state.projectsError = true
    view.rerender(<LiveReportingWorkspace initialKind="project-summary" />)
    await act(async () => finish({ id: 'old-report', status: 'GENERATED' }))
    expect(state.success).not.toHaveBeenCalled()
    expect(state.refetch).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Report name') as HTMLInputElement).value).toBe('')
    state.projectsError = false
    view.rerender(<LiveReportingWorkspace initialKind="project-summary" />)
    expect(
      screen.getByRole('button', { name: 'Generate private report' }).hasAttribute('disabled'),
    ).toBe(false)
  })
  it('suppresses cached preview ancillary timestamp and artifact labels on their own failed reads', () => {
    const view = render(<LiveReportingWorkspace initialKind="project-summary" />)
    state.previewError = true
    state.reportsError = true
    view.rerender(<LiveReportingWorkspace initialKind="project-summary" />)
    expect(screen.queryByText('Private report cell')).toBeNull()
    expect(screen.queryByText(/Current data generated/)).toBeNull()
    expect(screen.queryByText('Private saved report')).toBeNull()
  })
  it('downloads the saved report export using its stored format', async () => {
    render(<LiveReportingWorkspace initialKind="project-summary" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(state.downloadArtifact).toHaveBeenCalledOnce())
    expect(state.downloadArtifact.mock.calls[0][0]).toBe(
      `/projects/${state.project}/reports/30000000-0000-4000-8000-000000000003/export`,
    )
    expect(state.downloadArtifact.mock.calls[0][1]).toBe('Private saved report.pdf')
  })
  it.each([
    ['Q3: North/South <draft>?', 'Q3 North South draft.pdf'],
    ['  ...  ', 'report-30000000-0000-4000-8000-000000000003.pdf'],
  ])('makes the report name %j a safe file name', (name, expected) => {
    expect(reportFileName(name, '30000000-0000-4000-8000-000000000003', 'pdf')).toBe(expected)
  })
  it('hides generate and download actions for a role missing those permissions', () => {
    state.permissions = ['reports.read', 'reports.project.read', 'forms.read', 'assessments.read']
    render(<LiveReportingWorkspace initialKind="project-summary" />)
    expect(screen.queryByRole('button', { name: 'Generate private report' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })

  it('lists the monitoring and evaluation report kinds with their labels', () => {
    expect(kinds.MONITORING_REPORT.label).toBe('Monitoring report')
    expect(kinds.EVALUATION_REPORT.label).toBe('Evaluation report')
  })
})

describe('report kinds requiring monitoring.read', () => {
  const profile = (permissions: string[]) =>
    ({
      userId: 'u',
      organizationId: 'org',
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions,
      assignedProjectIds: [],
    }) as unknown as Parameters<typeof allowedKinds>[0]
  const grants = ['reports.read', 'reports.project.read', 'reports.indicator.read']

  it('does not offer monitoring or evaluation reports without monitoring.read', () => {
    const offered = allowedKinds(profile(grants))
    expect(offered).not.toContain('MONITORING_REPORT')
    expect(offered).not.toContain('EVALUATION_REPORT')
    expect(offered).toContain('PROJECT_SUMMARY')
  })

  it('offers both kinds with monitoring.read', () => {
    const offered = allowedKinds(profile([...grants, 'monitoring.read']))
    expect(offered).toEqual(expect.arrayContaining(['MONITORING_REPORT', 'EVALUATION_REPORT']))
  })
})

describe('beneficiary summary kind', () => {
  const profile = (role: string, permissions: string[]) =>
    ({
      userId: 'u',
      organizationId: 'org',
      roles: [role],
      permissions,
      assignedProjectIds: [],
    }) as unknown as Parameters<typeof allowedKinds>[0]
  const grants = ['reports.read', 'reports.beneficiary.read', 'beneficiaries.aggregates.read']

  it('is hidden from a project officer who lacks analytics.saddd.read', () => {
    expect(allowedKinds(profile('PROJECT_OFFICER', grants))).not.toContain('BENEFICIARY_SUMMARY')
  })

  it('is hidden when either aggregate grant is revoked', () => {
    const full = [...grants, 'analytics.saddd.read']
    for (const missing of ['analytics.saddd.read', 'beneficiaries.aggregates.read']) {
      const permissions = full.filter((permission) => permission !== missing)
      expect(allowedKinds(profile('MONITORING_AND_EVALUATION_OFFICER', permissions))).not.toContain(
        'BENEFICIARY_SUMMARY',
      )
    }
  })

  it('is offered with both aggregate grants', () => {
    const permissions = [...grants, 'analytics.saddd.read']
    expect(allowedKinds(profile('MONITORING_AND_EVALUATION_OFFICER', permissions))).toContain(
      'BENEFICIARY_SUMMARY',
    )
  })
})

describe('evaluation round selection', () => {
  const older = '60000000-0000-4000-8000-000000000005'
  const newer = '60000000-0000-4000-8000-000000000006'
  const rounds = [
    {
      id: newer,
      title: 'Evaluation 2025-12-10 to 2026-08-22',
      status: 'SIGNED_OFF',
      periodStart: '2025-12-10',
      periodEnd: '2026-08-22',
      signedOffAt: '2026-10-07T01:00:00.000Z',
      overallScore: '71.08',
    },
    {
      id: older,
      title: 'Evaluation 2025-01-01 to 2025-06-30',
      status: 'ARCHIVED',
      periodStart: '2025-01-01',
      periodEnd: '2025-06-30',
      signedOffAt: null,
      overallScore: null,
    },
  ]
  const choose = (index: number, option: string | RegExp) => {
    const native = screen.getAllByRole('combobox')[index] as HTMLSelectElement
    const value = Array.from(native.options).find((item) => item.text.match(option))?.value
    fireEvent.change(native, { target: { value } })
  }
  const openEvaluation = () => {
    render(<LiveReportingWorkspace initialKind="project-summary" />)
    choose(1, 'Evaluation report')
  }
  beforeEach(() => {
    vi.clearAllMocks()
    state.generate.mockResolvedValue({ id: 'report', status: 'GENERATED' })
    state.refetch.mockResolvedValue(undefined)
    state.native = true
    state.rounds = rounds
    state.permissions = [
      'reports.read',
      'reports.project.read',
      'reports.generate',
      'reports.export',
      'monitoring.read',
    ]
  })
  afterEach(() => {
    state.native = false
    cleanup()
  })

  it('defaults to the newest round and passes it to preview and generate', async () => {
    openEvaluation()
    expect(
      screen.getByText(/Evaluation 2025-12-10 to 2026-08-22 · Signed off 7 Oct 2026 · 71.08/),
    ).toBeTruthy()
    expect(state.preview.mock.lastCall?.[4]).toBe(newer)
    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))
    await waitFor(() => expect(state.generate).toHaveBeenCalledOnce())
    expect(state.generate.mock.calls[0][1]).toMatchObject({
      kind: 'EVALUATION_REPORT',
      evaluationId: newer,
      name: 'Evaluation 2025-12-10 to 2026-08-22 Evaluation report',
    })
  })

  it('passes the changed round to preview and generate', async () => {
    openEvaluation()
    choose(2, /Evaluation 2025-01-01 to 2025-06-30/)
    expect(state.preview.mock.lastCall?.[4]).toBe(older)
    fireEvent.click(screen.getByRole('button', { name: 'Generate private report' }))
    await waitFor(() => expect(state.generate).toHaveBeenCalledOnce())
    expect(state.generate.mock.calls[0][1].evaluationId).toBe(older)
  })

  it('disables the field and generation when no round is signed off', () => {
    state.rounds = []
    openEvaluation()
    expect(screen.getByText('No signed-off evaluation round yet')).toBeTruthy()
    expect(screen.getAllByRole('combobox')[2].hasAttribute('disabled')).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Generate private report' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('shows the round on a saved evaluation report', () => {
    state.savedEvaluation = { title: 'Midterm', periodStart: '2026-01-01', periodEnd: '2026-06-30' }
    render(<LiveReportingWorkspace initialKind="project-summary" />)
    expect(screen.getByText('Round: Midterm (2026-01-01 to 2026-06-30)')).toBeTruthy()
    state.savedEvaluation = null
  })
})
