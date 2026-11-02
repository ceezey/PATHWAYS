/* @vitest-environment jsdom */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  child,
  defaultAnswers,
  part,
  press,
  registration,
  review,
  show,
  totals,
} from './import-parts-card.harness'

const api = vi.hoisted(() => ({
  draftStageForm: vi.fn(),
  startFilePart: vi.fn(),
  validateImport: vi.fn(),
  processImport: vi.fn(),
  getImportBatch: vi.fn(),
  getHeldRows: vi.fn(),
  getActivities: vi.fn(),
  getJourneyStages: vi.fn(),
  draftFromImport: vi.fn(),
}))
const role = vi.hoisted(() => ({
  profile: { roles: ['MONITORING_AND_EVALUATION_OFFICER'], permissions: ['imports.read'] },
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => role }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: api }))
vi.mock('@/lib/api/forms', () => ({ formsClient: api }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const draftCalls = () => api.draftStageForm.mock.calls.map((call) => call.slice(2))
const tabbable = () =>
  Array.from(document.querySelectorAll<HTMLElement>('button, select, a[href]')).filter(
    (element) => !(element as HTMLButtonElement).disabled,
  )
const nameOf = (element: HTMLElement) => element.getAttribute('aria-label') ?? element.textContent

describe('import parts card', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    role.profile.permissions = ['imports.read']
    defaultAnswers(api)
  })
  afterEach(cleanup)

  it('shows one row per survey with its form state and counts', () => {
    show(
      registration([
        part(0, 'NONE'),
        part(
          1,
          'PUBLISHED',
          child('survey_b', {
            registrationCounts: { created: 5, updated: 0, unchanged: 0 },
            totals: { ...totals, unprocessed: 2, processed: 1 },
          }),
        ),
      ]),
    )
    const rowA = screen.getByRole('group', { name: 'Survey A' })
    const rowB = screen.getByRole('group', { name: 'Survey B' })
    expect(within(rowA).getByText('No form yet')).toBeTruthy()
    expect(within(rowB).getByText('Ready')).toBeTruthy()
    expect(within(rowB).getByText('Held').parentElement?.textContent).toContain('2')
    expect(within(rowB).getByText('Created').parentElement?.textContent).toContain('5')
  })

  it('shows created, unchanged, held and waiting counts of a survey, and no Updated', () => {
    const counted = child('survey_a', {
      status: 'PARTIALLY_PROCESSED',
      registrationCounts: { created: 3, updated: 0, unchanged: 2 },
      totals: { ...totals, unprocessed: 1, invalid: 1, waiting: 4 },
    })
    show(registration([part(0, 'PUBLISHED', counted), part(1, 'PUBLISHED')]))
    const row = screen.getByRole('group', { name: 'Survey A' })
    const count = (label: string) => within(row).getByText(label).parentElement?.textContent
    expect(count('Created')).toContain('3')
    expect(count('Unchanged')).toContain('2')
    // Invalid rows are held for review too.
    expect(count('Held')).toContain('2')
    expect(count('Waiting')).toContain('4')
    expect(within(row).queryByText('Updated')).toBeNull()
  })

  it('process is offered when the only unpublished survey has no rows', () => {
    const view = registration([part(0, 'PUBLISHED'), part(1, 'NONE')])
    const [first, second] = view.fileParts ?? []
    show({ ...view, fileParts: [first, { ...second, rows: 0 }] } as never)
    expect(screen.getByRole('button', { name: 'Process file' })).toBeTruthy()
  })

  it('prepare drafts each missing form once', async () => {
    show(registration([part(0, 'NONE'), part(1, 'NONE')]))
    press('Prepare survey forms')
    await waitFor(() => expect(api.draftStageForm).toHaveBeenCalledTimes(2))
    expect(draftCalls()).toEqual([
      ['survey_a', undefined],
      ['survey_b', undefined],
    ])
    await waitFor(() => expect(review.loadBatch).toHaveBeenCalledWith('batch-1', expect.anything()))
    expect(api.draftStageForm.mock.calls[0].slice(0, 2)).toEqual(['project-1', 'batch-1'])
    const links = await screen.findAllByRole('link', { name: /^Open draft/ })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/collection/projects/project-1/forms/form-survey_a',
      '/collection/projects/project-1/forms/form-survey_b',
    ])
  })

  it('leaves a part that already has a draft alone', async () => {
    show(registration([part(0, 'DRAFT'), part(1, 'NONE')]))
    expect(screen.getByText('Waiting to be published')).toBeTruthy()
    press('Prepare survey forms')
    await waitFor(() => expect(api.draftStageForm).toHaveBeenCalledTimes(1))
    expect(draftCalls()).toEqual([['survey_b', undefined]])
  })

  it('survey with no activity says it is waiting and who can help', async () => {
    api.draftStageForm.mockResolvedValue({ formId: null, stageId: 's', waitingForActivity: true })
    show(registration([part(0, 'NONE')]))
    press('Prepare survey forms')
    expect(
      await screen.findByText(
        'This survey needs an activity. Choose one, or ask a Project Manager to create it on the Activities page.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Open draft/ })).toBeNull()
  })

  it('pressing prepare again continues', async () => {
    api.draftStageForm.mockImplementation(async (_p, _b, code) =>
      code === 'survey_a'
        ? { formId: 'form-survey_a', stageId: 's-a', waitingForActivity: false }
        : { formId: null, stageId: 's-b', waitingForActivity: true },
    )
    const view = show(registration([part(0, 'NONE'), part(1, 'NONE')]))
    press('Prepare survey forms')
    await screen.findByText(/This survey needs an activity/)
    view.update(registration([part(0, 'DRAFT'), part(1, 'NONE')]))
    api.draftStageForm.mockClear()
    press('Prepare survey forms')
    await waitFor(() => expect(api.draftStageForm).toHaveBeenCalledTimes(1))
    expect(draftCalls()).toEqual([['survey_b', undefined]])
  })

  it('chosen activity is sent with its survey', async () => {
    show(registration([part(0, 'NONE'), part(1, 'NONE')]))
    const select = (await screen.findByLabelText('Activity for Survey A')) as HTMLSelectElement
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3))
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Waiting for an activity', 'Training one', 'Training two'])
    expect(select.value).toBe('')
    fireEvent.change(select, { target: { value: 'act-2' } })
    press('Prepare survey forms')
    await waitFor(() => expect(api.draftStageForm).toHaveBeenCalledTimes(2))
    expect(draftCalls()).toEqual([
      ['survey_a', 'act-2'],
      ['survey_b', undefined],
    ])
  })

  it('stage with a mapped activity starts on it', async () => {
    api.getJourneyStages.mockResolvedValue([
      { id: 's-a', name: '  survey   a ', mappedActivityIds: ['act-1'] },
      { id: 's-b', name: 'Survey B', mappedActivityIds: ['act-3'] },
    ])
    show(registration([part(0, 'NONE'), part(1, 'NONE')]))
    const select = (await screen.findByLabelText('Activity for Survey A')) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('act-1'))
    // A cancelled activity is not usable, so the survey still waits.
    expect((screen.getByLabelText('Activity for Survey B') as HTMLSelectElement).value).toBe('')
    press('Prepare survey forms')
    await waitFor(() => expect(api.draftStageForm).toHaveBeenCalledTimes(2))
    expect(draftCalls()[0]).toEqual(['survey_a', 'act-1'])
  })

  it('hidden prepare for someone who cannot manage forms', () => {
    show(registration([part(0, 'NONE'), part(1, 'PUBLISHED')]), { canManageForms: false })
    expect(screen.queryByRole('button', { name: 'Prepare survey forms' })).toBeNull()
    expect(screen.queryByLabelText('Activity for Survey A')).toBeNull()
    expect(
      screen.getByText(
        'Ask a Monitoring and Evaluation Officer or System Administrator to prepare its form.',
      ),
    ).toBeTruthy()
  })

  it('process waits until every form is published', () => {
    show(registration([part(0, 'PUBLISHED'), part(1, 'DRAFT')]))
    expect(screen.queryByRole('button', { name: 'Process file' })).toBeNull()
  })

  it('second file has nothing to prepare', () => {
    show(registration([part(0, 'PUBLISHED'), part(1, 'PUBLISHED')]))
    expect(screen.queryByRole('button', { name: 'Prepare survey forms' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Process file' })).toBeTruthy()
  })

  it('disables every step while another operation runs', () => {
    const held = child('survey_a', {
      status: 'PARTIALLY_PROCESSED',
      totals: { ...totals, unprocessed: 1, waiting: 2 },
    })
    show(registration([part(0, 'PUBLISHED', held), part(1, 'PUBLISHED')]), { pending: true })
    for (const name of ['Process file', 'Process waiting', 'Show held rows of Survey A']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
  })

  describe('held rows', () => {
    it('each row opens its held list', async () => {
      role.profile.permissions = ['imports.read', 'imports.review']
      const held = child('survey_a', {
        status: 'PARTIALLY_PROCESSED',
        totals: { ...totals, unprocessed: 1 },
      })
      api.getImportBatch.mockResolvedValue({ ...held, formType: 'TRAINING_SURVEY', mappings: [] })
      api.getHeldRows.mockResolvedValue([
        {
          id: 'row-1',
          rowNumber: 2,
          rawData: {},
          status: 'UNPROCESSED',
          processingErrorCode: 'STAGE_CHANGED',
          resolvedAt: null,
        },
      ])
      show(registration([part(0, 'PUBLISHED', held), part(1, 'PUBLISHED')]))
      const open = screen.getByRole('button', { name: 'Show held rows of Survey A' })
      expect(open.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(open)
      expect(await screen.findByText('Answers differ from PATHWAYS')).toBeTruthy()
      expect(api.getImportBatch).toHaveBeenCalledWith('project-1', 'child-survey_a')
      expect(api.getHeldRows).toHaveBeenCalledWith('project-1', 'child-survey_a')
      expect(screen.getByRole('button', { name: 'Hide held rows of Survey A' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /held rows of Survey B/ })).toBeNull()
    })

    it('offers the list for a survey whose only held rows are invalid', () => {
      const invalid = child('survey_a', {
        status: 'PARTIALLY_PROCESSED',
        totals: { ...totals, invalid: 2 },
      })
      show(registration([part(0, 'PUBLISHED', invalid)]))
      expect(screen.getByRole('button', { name: 'Show held rows of Survey A' })).toBeTruthy()
    })

    it('offers the list only for a survey with held rows', () => {
      show(registration([part(0, 'PUBLISHED', child('survey_a', { status: 'PROCESSED' }))]))
      expect(screen.queryByRole('button', { name: /held rows of Survey A/ })).toBeNull()
    })
  })

  describe('keyboard', () => {
    it('reaches the activity choice, prepare step and draft link in reading order', () => {
      show(registration([part(0, 'NONE'), part(1, 'DRAFT')]))
      const controls = tabbable()
      expect(controls.map(nameOf)).toEqual([
        'Prepare survey forms',
        'Activity for Survey A',
        'Open draft of Survey B',
      ])
      for (const control of controls) {
        control.focus()
        expect(document.activeElement).toBe(control)
      }
      expect(screen.getByRole('combobox', { name: 'Activity for Survey A' })).toBeTruthy()
    })

    it('reaches Process file, Process waiting and Held rows in reading order', () => {
      const held = child('survey_a', {
        status: 'PARTIALLY_PROCESSED',
        totals: { ...totals, unprocessed: 1, waiting: 2 },
      })
      show(registration([part(0, 'PUBLISHED', held), part(1, 'PUBLISHED')]))
      const controls = tabbable()
      expect(controls.map(nameOf)).toEqual([
        'Process file',
        'Process waiting',
        'Show held rows of Survey A',
      ])
      for (const control of controls) {
        control.focus()
        expect(document.activeElement).toBe(control)
      }
    })
  })
})
