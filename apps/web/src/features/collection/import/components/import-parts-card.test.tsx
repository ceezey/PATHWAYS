/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'

import { ImportPartsCard } from './import-parts-card'

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

const counts = { rows: 4, valid: 4, invalid: 0, processed: 0, unprocessed: 0, failed: 0 }
const totals = { ...counts, warnings: 0, waiting: 0 }
const partDefs = [
  { code: 'survey_a', name: 'Survey A' },
  { code: 'survey_b', name: 'Survey B' },
]
const child = (code: string, over: Record<string, unknown> = {}) =>
  ({
    id: `child-${code}`,
    projectId: 'project-1',
    formId: `form-${code}`,
    status: 'UPLOADED',
    storageStatus: 'STORED',
    mappingRevision: 0,
    validationRevision: 0,
    parentBatchId: 'batch-1',
    partCode: code,
    totals,
    ...over,
  }) as unknown as ImportBatchDefinition
const part = (
  index: number,
  formStatus: 'NONE' | 'DRAFT' | 'PUBLISHED',
  batch: unknown = null,
) => ({
  ...partDefs[index],
  formId: formStatus === 'NONE' ? null : `form-${partDefs[index].code}`,
  formName: formStatus === 'NONE' ? null : `Form ${partDefs[index].name}`,
  formStatus,
  batch,
})
const registration = (parts: unknown[]) =>
  ({
    id: 'batch-1',
    projectId: 'project-1',
    formId: 'form-reg',
    formType: 'BENEFICIARY_REGISTRATION',
    status: 'VALIDATED',
    mappingRevision: 1,
    validationRevision: 1,
    totals: { ...totals, valid: 3 },
    fileParts: partDefs.map((def) => ({ ...def, rows: 4, firstColumn: 1, lastColumn: 2 })),
    parts,
  }) as unknown as ImportBatchDefinition

const mapAutomatically = vi.fn()
const review = { loadBatch: vi.fn() }
const setDraftTarget = vi.fn()
const stateWith = (batch: ImportBatchDefinition, over: Record<string, unknown> = {}) => ({
  batch,
  projectId: 'project-1',
  canManageForms: true,
  canUpload: true,
  canValidate: true,
  canProcess: true,
  pending: false,
  begin: () => ({ valid: () => true, finish: vi.fn() }),
  importBatch: { stopRequested: { current: false }, mapAutomatically },
  setProcessing: vi.fn(),
  setDraftTarget,
  ...over,
})
const show = (batch: ImportBatchDefinition, over: Record<string, unknown> = {}) => {
  const view = render(
    <ImportPartsCard
      batch={batch}
      review={review as never}
      state={stateWith(batch, over) as never}
    />,
  )
  return {
    ...view,
    update: (next: ImportBatchDefinition) =>
      view.rerender(
        <ImportPartsCard
          batch={next}
          review={review as never}
          state={stateWith(next, over) as never}
        />,
      ),
  }
}
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const draftCalls = () => api.draftStageForm.mock.calls.map((call) => call.slice(2))
const processedIds = () => api.processImport.mock.calls.map((call) => call[1])

describe('import parts card', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    role.profile.permissions = ['imports.read']
    api.getActivities.mockResolvedValue([
      { id: 'act-1', title: 'Training one', status: 'Planned' },
      { id: 'act-2', title: 'Training two', status: 'In Progress' },
      { id: 'act-3', title: 'Old training', status: 'Cancelled' },
    ])
    api.getJourneyStages.mockResolvedValue([])
    api.draftStageForm.mockImplementation(async (_p, _b, code) => ({
      formId: `form-${code}`,
      stageId: `stage-${code}`,
      waitingForActivity: false,
    }))
    api.startFilePart.mockImplementation(async (_p, _b, code) => child(code))
    mapAutomatically.mockResolvedValue({ coverage: 'COVERED', mappingRevision: 1 })
    api.validateImport.mockImplementation(async (_p, id) => ({
      ...child(id.replace('child-', ''), { status: 'VALIDATED', validationRevision: 1 }),
      totals: { ...totals, valid: 4 },
    }))
    api.processImport.mockImplementation(async (_p, id) => ({
      id,
      status: 'PROCESSED',
      validationRevision: 1,
      totals: { ...totals, processed: id === 'batch-1' ? 3 : 4 },
    }))
  })
  afterEach(cleanup)

  it('shows one row per survey with its form state and counts', async () => {
    show(
      registration([
        part(0, 'NONE'),
        part(
          1,
          'PUBLISHED',
          child('survey_b', { totals: { ...totals, unprocessed: 2, processed: 1 } }),
        ),
      ]),
    )
    const rowA = screen.getByRole('group', { name: 'Survey A' })
    const rowB = screen.getByRole('group', { name: 'Survey B' })
    expect(within(rowA).getByText('No form yet')).toBeTruthy()
    expect(within(rowB).getByText('Ready')).toBeTruthy()
    expect(within(rowB).getByText('Held').parentElement?.textContent).toContain('2')
    expect(within(rowB).getByText('Created').parentElement?.textContent).toContain('0')
  })

  it('prepare drafts each missing form once', async () => {
    show(registration([part(0, 'NONE'), part(1, 'NONE')]))
    press('Prepare survey forms')
    await waitFor(() => expect(api.draftStageForm).toHaveBeenCalledTimes(2))
    expect(draftCalls()).toEqual([
      ['survey_a', undefined],
      ['survey_b', undefined],
    ])
    expect(api.draftStageForm.mock.calls[0].slice(0, 2)).toEqual(['project-1', 'batch-1'])
    const links = await screen.findAllByRole('link', { name: /^Open draft/ })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/collection/projects/project-1/forms/form-survey_a',
      '/collection/projects/project-1/forms/form-survey_b',
    ])
    expect(review.loadBatch).toHaveBeenCalledWith('batch-1', expect.anything())
  })

  it('leaves a part that already has a draft alone', async () => {
    show(registration([part(0, 'DRAFT'), part(1, 'NONE')]))
    expect(screen.getByText('Waiting to be published')).toBeTruthy()
    press('Prepare survey forms')
    await waitFor(() => expect(api.draftStageForm).toHaveBeenCalledTimes(1))
    expect(draftCalls()).toEqual([['survey_b', undefined]])
  })

  it('survey with no activity says it is waiting and who can help', async () => {
    api.draftStageForm.mockResolvedValue({
      formId: null,
      stageId: 'stage-1',
      waitingForActivity: true,
    })
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
        'This survey has no form yet. Ask a Monitoring and Evaluation Officer or System Administrator to prepare it.',
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

  it('process runs registration before surveys', async () => {
    show(registration([part(0, 'PUBLISHED'), part(1, 'PUBLISHED')]))
    press('Process file')
    await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(3))
    expect(processedIds()).toEqual(['batch-1', 'child-survey_a', 'child-survey_b'])
    expect(api.startFilePart.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['project-1', 'batch-1', 'survey_a'],
      ['project-1', 'batch-1', 'survey_b'],
    ])
    expect(api.validateImport).toHaveBeenCalledWith('project-1', 'child-survey_a', 1)
    expect(api.processImport.mock.calls[1]).toEqual(['project-1', 'child-survey_a', 1])
  })

  it('does not start a survey that already has a batch', async () => {
    const started = child('survey_a', {
      status: 'VALIDATED',
      mappingRevision: 1,
      validationRevision: 2,
    })
    show(registration([part(0, 'PUBLISHED', started), part(1, 'PUBLISHED')]))
    press('Process file')
    await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(3))
    expect(api.startFilePart).toHaveBeenCalledTimes(1)
    expect(api.processImport.mock.calls[1]).toEqual(['project-1', 'child-survey_a', 2])
  })

  it('uncovered survey does not stop the others', async () => {
    mapAutomatically.mockImplementation(async (_p, batch) =>
      batch.partCode === 'survey_a'
        ? { coverage: 'NOT_COVERED', mappingRevision: 1 }
        : { coverage: 'COVERED', mappingRevision: 1 },
    )
    show(registration([part(0, 'PUBLISHED'), part(1, 'PUBLISHED')]))
    press('Process file')
    await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(2))
    expect(processedIds()).toEqual(['batch-1', 'child-survey_b'])
    const rowA = await screen.findByRole('group', { name: 'Survey A' })
    expect(within(rowA).getByText("This survey's form needs updating.")).toBeTruthy()
    api.draftFromImport.mockResolvedValue({ form: { id: 'draft-9', projectId: 'project-1' } })
    fireEvent.click(within(rowA).getByRole('button', { name: 'Prepare form' }))
    await waitFor(() =>
      expect(setDraftTarget).toHaveBeenCalledWith({ projectId: 'project-1', formId: 'draft-9' }),
    )
    expect(api.draftFromImport).toHaveBeenCalledWith(
      'project-1',
      'form-survey_a',
      'child-survey_a',
      1,
    )
  })

  it('a refused start is named on its row and the others continue', async () => {
    api.startFilePart.mockImplementation(async (_p, _b, code) => {
      if (code === 'survey_a')
        throw new Error("Mark the correct answers for this survey's total score first.")
      return child(code)
    })
    show(registration([part(0, 'PUBLISHED'), part(1, 'PUBLISHED')]))
    press('Process file')
    await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(2))
    const rowA = await screen.findByRole('group', { name: 'Survey A' })
    expect(within(rowA).getByText(/Mark the correct answers/)).toBeTruthy()
  })

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
    expect(screen.queryByRole('button', { name: 'Show held rows of Survey B' })).toBeNull()
  })

  it('waiting count and Process waiting shown', async () => {
    const waiting = child('survey_a', {
      status: 'PARTIALLY_PROCESSED',
      validationRevision: 2,
      totals: { ...totals, waiting: 4 },
    })
    show({
      ...registration([
        part(0, 'PUBLISHED', waiting),
        part(1, 'PUBLISHED', child('survey_b', { status: 'PROCESSED' })),
      ]),
      status: 'PROCESSED',
    } as ImportBatchDefinition)
    expect(screen.getByText('4 waiting for their registration to be resolved')).toBeTruthy()
    press('Process waiting')
    await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(1))
    expect(api.processImport).toHaveBeenCalledWith('project-1', 'child-survey_a', 2)
  })

  it('every control is a labelled native control', async () => {
    show(registration([part(0, 'NONE'), part(1, 'DRAFT')]))
    const select = await screen.findByLabelText('Activity for Survey A')
    expect(select.tagName).toBe('SELECT')
    for (const control of screen.getAllByRole('button')) {
      expect(control.tagName).toBe('BUTTON')
      expect(control.textContent || control.getAttribute('aria-label')).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: 'Open draft of Survey B' }).getAttribute('href')).toBe(
      '/collection/projects/project-1/forms/form-survey_b',
    )
  })
})
