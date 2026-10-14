/* @vitest-environment jsdom */
import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveReportingWorkspace } from './live-reporting-workspace'

const first = '10000000-0000-4000-8000-000000000001'
const second = '10000000-0000-4000-8000-000000000002'
const formA = '20000000-0000-4000-8000-000000000002'
const formB = '20000000-0000-4000-8000-000000000003'
const newer = '60000000-0000-4000-8000-000000000006'
const older = '60000000-0000-4000-8000-000000000005'
const everything = [
  'reports.read',
  'reports.project.read',
  'reports.indicator.read',
  'reports.beneficiary.read',
  'analytics.saddd.read',
  'beneficiaries.aggregates.read',
  'monitoring.read',
  'forms.read',
  'assessments.read',
  'reports.generate',
  'reports.export',
]
const state = vi.hoisted(() => ({
  user: 'reviewer-1',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  assigned: [] as string[],
  permissions: [] as string[],
  saved: [] as unknown[],
  previewError: false,
  previewPending: false,
  reportsError: false,
  columns: ['Title'],
  rows: [['Private report cell']],
  generate: vi.fn(),
  preview: vi.fn(),
  downloadArtifact: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  reads: [] as string[],
}))
const projects = [
  { id: first, title: 'Recorded project' },
  { id: second, title: 'Second project' },
]
const forms = [
  { id: formA, name: 'First survey', code: 'ONE', version: 1 },
  { id: formB, name: 'Second survey', code: 'TWO', version: 2 },
]
const rounds = [
  { id: newer, title: 'Newer round', status: 'SIGNED_OFF', signedOffAt: null, overallScore: null },
  { id: older, title: 'Older round', status: 'ARCHIVED', signedOffAt: null, overallScore: null },
]
const saved = (format: string | null, status = 'GENERATED') => [
  { id: '30000000-0000-4000-8000-000000000003', name: 'Saved report', format, status },
]
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'org',
      roles: state.roles,
      permissions: state.permissions,
      assignedProjectIds: state.assigned,
    },
  }),
}))
vi.mock('@/lib/api/reports', () => ({
  reportsClient: {
    generateReport: (...args: unknown[]) => state.generate(...args),
    reportPreview: (...args: unknown[]) => state.preview(...args),
  },
}))
vi.mock('@/lib/services/core-feature-client', () => ({
  downloadCoreArtifact: (...args: unknown[]) => state.downloadArtifact(...args),
}))
vi.mock('@/lib/api/projects', () => ({ projectsClient: { getProjects: vi.fn() } }))
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: (key: string, _id: unknown, _grant: unknown, fetcher?: () => unknown) => {
    const isPreview = key.startsWith('report-preview')
    if (isPreview) {
      state.reads.push(key)
      void fetcher?.()
    }
    const data =
      key === 'report-projects'
        ? projects
        : key === 'report-evaluation-rounds'
          ? rounds
          : key === 'report-survey-forms'
            ? forms
            : isPreview
              ? {
                  projectId: first,
                  formId: null,
                  kind: 'PROJECT_SUMMARY',
                  columns: state.columns,
                  rows: state.rows,
                  generatedAt: '2026-09-27T00:00:00Z',
                  unavailableReasons: [],
                }
              : state.saved
    return {
      data,
      isPending: isPreview && state.previewPending,
      isError: isPreview ? state.previewError : key === 'report-artifacts' && state.reportsError,
      refetch: state.refetch,
    }
  },
}))
// Radix popups hang jsdom after a selection, so every select is a native one here.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    disabled?: boolean
    children?: React.ReactNode
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => state.success(...args),
    warning: (...args: unknown[]) => state.warning(...args),
    error: (...args: unknown[]) => state.error(...args),
  },
}))

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const settle = () => act(async () => new Promise((done) => setTimeout(done, 0)))
type Kind = 'project-summary' | 'indicator-summary' | 'beneficiary-summary' | 'survey-results'
let current: { kind: Kind; previewOnly: boolean } = { kind: 'project-summary', previewOnly: false }
const ui = () => (
  <LiveReportingWorkspace initialKind={current.kind} previewOnly={current.previewOnly} />
)
const mount = (kind: Kind = 'project-summary', previewOnly = false) => {
  current = { kind, previewOnly }
  return render(ui())
}
const selectOf = (label: string) =>
  screen.getByText(label).closest('label')?.querySelector('select') as HTMLSelectElement
const choose = (label: string, option: string) => {
  const native = selectOf(label)
  const value = Array.from(native.options).find((item) => item.text === option)?.value
  fireEvent.change(native, { target: { value } })
}
const nameInput = () => screen.getByLabelText('Report name') as HTMLInputElement
const type = (value: string) => fireEvent.change(nameInput(), { target: { value } })
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const generateButton = () => screen.queryByRole('button', { name: 'Generate private report' })
const lastPreview = () => state.preview.mock.lastCall as unknown[]
const lastKey = () => state.reads[state.reads.length - 1]
const boundaries = ['project', 'identity', 'storage'] as const
const changeOwner = (boundary: (typeof boundaries)[number], view: ReturnType<typeof mount>) => {
  if (boundary === 'project') return choose('Project', 'Second project')
  if (boundary === 'identity') state.user = 'reviewer-2'
  else act(() => clearSensitiveDraftStorage())
  view.rerender(ui())
}

beforeEach(() => {
  vi.clearAllMocks()
  state.user = 'reviewer-1'
  state.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  state.assigned = [first, second]
  state.permissions = everything
  state.saved = saved('PDF')
  state.previewError = false
  state.previewPending = false
  state.reportsError = false
  state.columns = ['Title']
  state.rows = [['Private report cell']]
  state.reads = []
  state.generate.mockResolvedValue({ id: 'report', status: 'GENERATED' })
  state.downloadArtifact.mockResolvedValue(undefined)
  state.refetch.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('report context choices', () => {
  it.each([
    [false, true],
    [true, false],
  ])('preview only %s offers the generate action: %s', (previewOnly, offered) => {
    mount('project-summary', previewOnly)
    expect(generateButton() !== null).toBe(offered)
    expect(nameInput().disabled).toBe(false)
    expect(button('Download').disabled).toBe(false)
  })

  it.each(['CSV', 'XLSX', 'XLS', 'PDF'])(
    'sends the %s format chosen for generation',
    async (format) => {
      mount()
      expect(selectOf('Format').value).toBe('PDF')
      if (format !== 'PDF') choose('Format', format)
      expect(selectOf('Format').value).toBe(format)
      fireEvent.click(button('Generate private report'))
      await waitFor(() => expect(state.generate).toHaveBeenCalledOnce())
      expect(state.generate.mock.calls[0][1].format).toBe(format)
    },
  )

  it('generates for the project that was chosen', async () => {
    mount()
    choose('Project', 'Second project')
    expect(selectOf('Project').value).toBe(second)
    fireEvent.click(button('Generate private report'))
    await waitFor(() => expect(state.generate).toHaveBeenCalledOnce())
    expect(state.generate.mock.calls[0][0]).toBe(second)
  })

  it.each([
    ['project-summary', 'PROJECT_SUMMARY'],
    ['indicator-summary', 'INDICATOR_SUMMARY'],
    ['beneficiary-summary', 'BENEFICIARY_SUMMARY'],
    ['survey-results', 'SURVEY_FORM_RESULTS'],
  ] as const)('opens the %s page on the %s kind', (initial, kind) => {
    mount(initial)
    expect(selectOf('Report type').value).toBe(kind)
    expect(lastKey()).toMatch(new RegExp(`^report-preview:${kind}:`))
  })

  it('clamps an initial kind the role may not open to the first allowed kind', () => {
    state.permissions = everything.filter((item) => item !== 'reports.indicator.read')
    mount('indicator-summary')
    expect(selectOf('Report type').value).toBe('PROJECT_SUMMARY')
    expect(lastKey()).toMatch(/^report-preview:PROJECT_SUMMARY:/)
  })

  it('falls back to the project summary when no kind is allowed', () => {
    state.roles = ['MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_MANAGER']
    mount('indicator-summary')
    expect(lastKey()).toMatch(/^report-preview:PROJECT_SUMMARY:/)
  })

  it('reads the preview for the chosen survey form', () => {
    mount('survey-results')
    expect(lastPreview()[3]).toBe(formA)
    choose('Published training survey', 'Second survey · version 2')
    expect(lastPreview()[3]).toBe(formB)
  })

  it('returns to the first survey when the project changes', () => {
    mount('survey-results')
    choose('Published training survey', 'Second survey · version 2')
    expect(lastPreview()[3]).toBe(formB)
    choose('Project', 'Second project')
    expect(lastPreview()[3]).toBe(formA)
  })

  it('returns to the first round when the project changes', () => {
    mount()
    choose('Report type', 'Evaluation report')
    choose('Round', 'Older round')
    expect(lastPreview()[4]).toBe(older)
    choose('Project', 'Second project')
    expect(lastPreview()[4]).toBe(newer)
  })

  it('sends the survey form on a survey report only', async () => {
    mount('survey-results')
    fireEvent.click(button('Generate private report'))
    await waitFor(() => expect(state.generate).toHaveBeenCalledOnce())
    expect(state.generate.mock.calls[0][1]).toMatchObject({
      kind: 'SURVEY_FORM_RESULTS',
      formId: formA,
    })
    expect('evaluationId' in state.generate.mock.calls[0][1]).toBe(false)
  })

  it('sends neither a survey form nor a round on a project report', async () => {
    mount()
    fireEvent.click(button('Generate private report'))
    await waitFor(() => expect(state.generate).toHaveBeenCalledOnce())
    expect(Object.keys(state.generate.mock.calls[0][1]).sort()).toEqual([
      'clientRequestId',
      'format',
      'kind',
      'name',
    ])
  })
})

describe('report draft owners and saved reports', () => {
  it.each(['previewError', 'previewPending'] as const)(
    'keeps the report name read-only while the %s state holds',
    (flag) => {
      state[flag] = true
      mount()
      expect(nameInput().disabled).toBe(true)
    },
  )

  it.each(['kind', 'survey', 'round', 'project'] as const)(
    'clears the typed name when the %s choice changes',
    (choice) => {
      mount(choice === 'survey' ? 'survey-results' : 'project-summary')
      if (choice === 'round') choose('Report type', 'Evaluation report')
      type('Private draft name')
      expect(nameInput().value).toBe('Private draft name')
      if (choice === 'kind') choose('Report type', 'Indicator summary')
      if (choice === 'survey') choose('Published training survey', 'Second survey · version 2')
      if (choice === 'round') choose('Round', 'Older round')
      if (choice === 'project') choose('Project', 'Second project')
      expect(nameInput().value).toBe('')
    },
  )

  it('trims the typed name and falls back to the default name when it is blank', async () => {
    mount()
    type('  Quarterly report  ')
    fireEvent.click(button('Generate private report'))
    await waitFor(() => expect(state.generate).toHaveBeenCalledOnce())
    expect(state.generate.mock.calls[0][1].name).toBe('Quarterly report')
    await settle()
    type('   ')
    fireEvent.click(button('Generate private report'))
    await waitFor(() => expect(state.generate).toHaveBeenCalledTimes(2))
    expect(state.generate.mock.calls[1][1].name).toBe('Recorded project Project summary')
  })

  it('lets a role with only the generate permission draft but not download', () => {
    state.permissions = everything.filter((item) => item !== 'reports.export')
    mount()
    expect(nameInput().disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })

  it('lets a role with only the export permission download but not draft', async () => {
    state.permissions = everything.filter((item) => item !== 'reports.generate')
    mount()
    expect(nameInput().disabled).toBe(true)
    expect(generateButton()).toBeNull()
    fireEvent.click(button('Download'))
    await waitFor(() => expect(state.downloadArtifact).toHaveBeenCalledOnce())
  })

  it('blocks drafting, generation and download for a project the user is not assigned to', () => {
    state.assigned = []
    mount()
    expect(nameInput().disabled).toBe(true)
    expect(button('Generate private report').disabled).toBe(true)
    fireEvent.click(button('Download'))
    expect(state.downloadArtifact).not.toHaveBeenCalled()
    expect(screen.queryByText(/Downloading report/)).toBeNull()
  })

  it('disables generation when the preview has no columns', () => {
    state.columns = []
    state.rows = []
    mount()
    expect(button('Generate private report').disabled).toBe(true)
  })

  it.each([
    ['GENERATED', 'PDF', false],
    ['DRAFT', 'PDF', true],
    ['ARCHIVED', 'PDF', true],
    ['GENERATED', null, true],
  ])('download of a %s report with format %s is disabled: %s', (status, format, off) => {
    state.saved = saved(format, status)
    mount()
    expect(button('Download').disabled).toBe(off)
  })
})

describe('report download', () => {
  it.each(['CSV', 'XLSX', 'XLS', 'PDF'])(
    'downloads a %s report with its own extension and messages',
    async (format) => {
      const pending = deferred<undefined>()
      state.downloadArtifact.mockReturnValue(pending.promise)
      state.saved = saved(format)
      mount()
      fireEvent.click(button('Download'))
      expect(screen.getByText(`Downloading report as ${format}.`)).toBeTruthy()
      expect(state.downloadArtifact.mock.calls[0][1]).toBe(`Saved report.${format.toLowerCase()}`)
      const isCurrent = state.downloadArtifact.mock.calls[0][2] as () => boolean
      expect(isCurrent()).toBe(true)
      await act(async () => pending.resolve(undefined))
      expect(screen.getByText(`Report downloaded as ${format}.`)).toBeTruthy()
    },
  )

  it('reports a fixed message when the download fails without a message', async () => {
    state.downloadArtifact.mockRejectedValue('blocked')
    mount()
    fireEvent.click(button('Download'))
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Report download unavailable.'))
    expect(screen.getByText('Report download unavailable.')).toBeTruthy()
  })

  it.each(boundaries)(
    'ignores a download that lands after the %s owner changed',
    async (boundary) => {
      const pending = deferred<undefined>()
      state.downloadArtifact.mockReturnValue(pending.promise)
      const view = mount()
      fireEvent.click(button('Download'))
      const isCurrent = state.downloadArtifact.mock.calls[0][2] as () => boolean
      changeOwner(boundary, view)
      expect(isCurrent()).toBe(false)
      await act(async () => pending.resolve(undefined))
      expect(screen.queryByText(/Report downloaded/)).toBeNull()
    },
  )

  it.each(boundaries)(
    'ignores a download failure that lands after the %s owner changed',
    async (boundary) => {
      const pending = deferred<undefined>()
      state.downloadArtifact.mockReturnValue(pending.promise)
      const view = mount()
      fireEvent.click(button('Download'))
      changeOwner(boundary, view)
      await act(async () => pending.reject(Error('Download blocked')))
      expect(state.error).not.toHaveBeenCalled()
      expect(screen.queryByText('Download blocked')).toBeNull()
    },
  )

  it('ignores a download that lands after the saved reports stopped loading', async () => {
    const pending = deferred<undefined>()
    state.downloadArtifact.mockReturnValue(pending.promise)
    const view = mount()
    fireEvent.click(button('Download'))
    state.reportsError = true
    view.rerender(ui())
    await act(async () => pending.resolve(undefined))
    expect(screen.queryByText(/Report downloaded/)).toBeNull()
  })
})

describe('report generation completion', () => {
  it('announces a generated report once the saved reports refetch', async () => {
    mount()
    fireEvent.click(button('Generate private report'))
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Private report generated.'))
    expect(state.refetch).toHaveBeenCalledOnce()
    expect(screen.getByText('Private report generated.')).toBeTruthy()
  })

  it('reports a fixed message when generation fails without a message', async () => {
    state.generate.mockRejectedValue('lost')
    mount()
    fireEvent.click(button('Generate private report'))
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Report generation unavailable.'))
  })

  it('ignores a generation that lands after the preview stopped loading', async () => {
    const pending = deferred<unknown>()
    state.generate.mockReturnValue(pending.promise)
    const view = mount()
    fireEvent.click(button('Generate private report'))
    state.previewError = true
    view.rerender(ui())
    await act(async () => pending.resolve({ id: 'old', status: 'GENERATED' }))
    expect(state.success).not.toHaveBeenCalled()
    expect(state.refetch).not.toHaveBeenCalled()
  })

  it.each(boundaries)(
    'ignores a generation that finishes refetching after the %s owner changed',
    async (boundary) => {
      const refetch = deferred<undefined>()
      state.refetch.mockReturnValue(refetch.promise)
      const view = mount()
      fireEvent.click(button('Generate private report'))
      await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce())
      changeOwner(boundary, view)
      await act(async () => refetch.resolve(undefined))
      expect(state.success).not.toHaveBeenCalled()
      expect(state.warning).not.toHaveBeenCalled()
      expect(screen.queryByText('Private report generated.')).toBeNull()
    },
  )

  it.each(boundaries)(
    'ignores a generation failure after the %s owner changed',
    async (boundary) => {
      const pending = deferred<unknown>()
      state.generate.mockReturnValue(pending.promise)
      const view = mount()
      fireEvent.click(button('Generate private report'))
      changeOwner(boundary, view)
      await act(async () => pending.reject(Error('Response lost')))
      expect(state.error).not.toHaveBeenCalled()
      expect(screen.queryByText('Response lost')).toBeNull()
    },
  )

  it.each(boundaries)(
    'keeps a newer generation busy when an older one ends after the %s owner changed',
    async (boundary) => {
      const oldRun = deferred<unknown>()
      const newRun = deferred<unknown>()
      state.generate.mockReturnValueOnce(oldRun.promise).mockReturnValueOnce(newRun.promise)
      const view = mount()
      fireEvent.click(button('Generate private report'))
      changeOwner(boundary, view)
      fireEvent.click(button('Generate private report'))
      expect(button('Generating').disabled).toBe(true)
      await act(async () => oldRun.resolve({ id: 'old', status: 'GENERATED' }))
      expect(button('Generating').disabled).toBe(true)
      await act(async () => newRun.resolve({ id: 'new', status: 'GENERATED' }))
      await waitFor(() => expect(button('Generate private report').disabled).toBe(false))
    },
  )
})
