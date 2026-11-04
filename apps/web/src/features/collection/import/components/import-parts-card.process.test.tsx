/* @vitest-environment jsdom */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'

import {
  child,
  defaultAnswers,
  mapAutomatically,
  part,
  press,
  registration,
  setDraftTarget,
  show,
  totals,
} from './import-parts-card.harness'

const api = vi.hoisted(() => ({
  startFilePart: vi.fn(),
  validateImport: vi.fn(),
  processImport: vi.fn(),
  getImportBatch: vi.fn(),
  getActivities: vi.fn(),
  getJourneyStages: vi.fn(),
  draftStageForm: vi.fn(),
  draftFromImport: vi.fn(),
  getDigitalForms: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: { roles: [], permissions: [] } }),
}))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: api }))
vi.mock('@/lib/api/forms', () => ({ formsClient: api }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

// jsdom has no scrolling, so the row's scroll is recorded instead.
const scrolled = vi.fn()
Element.prototype.scrollIntoView = scrolled

const processedIds = () => api.processImport.mock.calls.map((call) => call[1])
const bothPublished = () => registration([part(0, 'PUBLISHED'), part(1, 'PUBLISHED')])

describe('import parts card processing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    defaultAnswers(api)
  })
  afterEach(cleanup)

  it('process runs registration before surveys', async () => {
    show(bothPublished())
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

  describe('a survey whose form does not cover its file', () => {
    it('does not stop the others and offers Prepare form', async () => {
      mapAutomatically.mockImplementation(async (_p, batch) =>
        batch.partCode === 'survey_a'
          ? { coverage: 'NOT_COVERED', mappingRevision: 1 }
          : { coverage: 'COVERED', mappingRevision: 1 },
      )
      show(bothPublished())
      press('Process file')
      await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(2))
      expect(processedIds()).toEqual(['batch-1', 'child-survey_b'])
      const rowA = await screen.findByRole('group', { name: 'Survey A' })
      expect(within(rowA).getByText("This survey's form needs updating.")).toBeTruthy()
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Survey A needs attention.'))
      expect(scrolled).toHaveBeenCalledTimes(1)
      expect(scrolled.mock.contexts[0]).toBe(rowA)
      expect(document.activeElement).toBe(rowA)
      expect(toast.success).not.toHaveBeenCalled()
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

    it('starts a newer published form version and validates the new batch', async () => {
      const old = child('survey_a', { status: 'MAPPED', mappingRevision: 1, formVersion: 1 })
      api.startFilePart.mockImplementation(async (_p, _b, code) =>
        code === 'survey_a'
          ? child(code, { id: 'child-survey_a-v2', formVersion: 2, status: 'UPLOADED' })
          : child(code),
      )
      show(registration([part(0, 'PUBLISHED', old), part(1, 'PUBLISHED')]))
      press('Process file')
      await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(3))
      expect(api.startFilePart.mock.calls.map((call) => call[2])).toEqual(['survey_a', 'survey_b'])
      expect(api.getImportBatch).not.toHaveBeenCalled()
      expect(api.validateImport).toHaveBeenCalledWith('project-1', 'child-survey_a-v2', 1)
      expect(api.validateImport).not.toHaveBeenCalledWith('project-1', 'child-survey_a', 1)
    })

    it('keeps the Prepare form step for a survey its form still does not cover', async () => {
      const mapped = child('survey_a', { status: 'MAPPED', mappingRevision: 1 })
      api.startFilePart.mockImplementation(async (_p, _b, code) =>
        code === 'survey_a'
          ? {
              ...mapped,
              coverage: { coverage: 'NOT_COVERED', uncoveredColumns: 2, unresolvedValues: 0 },
            }
          : child(code),
      )
      show(registration([part(0, 'PUBLISHED', mapped), part(1, 'PUBLISHED')]))
      press('Process file')
      await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(2))
      expect(api.startFilePart).toHaveBeenCalledWith('project-1', 'batch-1', 'survey_a')
      expect(api.validateImport).not.toHaveBeenCalledWith('project-1', 'child-survey_a', 1)
      const rowA = await screen.findByRole('group', { name: 'Survey A' })
      expect(within(rowA).getByRole('button', { name: 'Prepare form' })).toBeTruthy()
    })

    it('a refused Prepare form leads to the existing draft', async () => {
      mapAutomatically.mockResolvedValue({ coverage: 'NOT_COVERED', mappingRevision: 1 })
      api.draftFromImport.mockRejectedValue(
        new Error('A newer form version already exists; open that version instead.'),
      )
      api.getDigitalForms.mockResolvedValue([
        { id: 'form-survey_a', code: 'stage_a', version: 1, status: 'PUBLISHED' },
        { id: 'draft-7', code: 'stage_a', version: 2, status: 'DRAFT' },
        { id: 'other-draft', code: 'stage_b', version: 3, status: 'DRAFT' },
      ])
      show(bothPublished())
      press('Process file')
      const rowA = await screen.findByRole('group', { name: 'Survey A' })
      fireEvent.click(within(rowA).getByRole('button', { name: 'Prepare form' }))
      await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1))
      const [text, options] = vi.mocked(toast.info).mock.calls[0]
      expect(text).toBe('Survey A already has a draft form (version 2).')
      expect(options).toMatchObject({ position: 'bottom-right', action: { label: 'Open draft' } })
      ;(options?.action as unknown as { onClick: () => void }).onClick()
      expect(setDraftTarget).toHaveBeenCalledWith({ projectId: 'project-1', formId: 'draft-7' })
    })

    it('sends one request when Prepare form is pressed twice', async () => {
      const mapped = child('survey_a', { status: 'MAPPED', mappingRevision: 1 })
      api.startFilePart.mockImplementation(async (_p, _b, code) =>
        code === 'survey_a'
          ? {
              ...mapped,
              coverage: { coverage: 'NOT_COVERED', uncoveredColumns: 2, unresolvedValues: 0 },
            }
          : child(code),
      )
      api.draftFromImport.mockReturnValue(new Promise(() => {}))
      show(registration([part(0, 'PUBLISHED', mapped), part(1, 'PUBLISHED')]))
      press('Process file')
      const button = await screen.findByRole('button', { name: 'Prepare form' })
      fireEvent.click(button)
      fireEvent.click(button)
      await waitFor(() => expect(api.draftFromImport).toHaveBeenCalledTimes(1))
    })
  })

  it('a refused start is named on its row and the others continue', async () => {
    api.startFilePart.mockImplementation(async (_p, _b, code) => {
      if (code === 'survey_a')
        throw new Error("Mark the correct answers for this survey's total score first.")
      return child(code)
    })
    show(bothPublished())
    press('Process file')
    await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(2))
    const rowA = await screen.findByRole('group', { name: 'Survey A' })
    expect(within(rowA).getByText(/Mark the correct answers/)).toBeTruthy()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Survey A needs attention.'))
    expect(scrolled.mock.contexts[0]).toBe(rowA)
  })

  it('names the first stopped survey and how many more need attention', async () => {
    api.startFilePart.mockRejectedValue(new Error("Publish this survey's form first."))
    show(bothPublished())
    press('Process file')
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Survey A and 1 more survey need attention.'),
    )
    expect(scrolled.mock.contexts[0]).toBe(screen.getByRole('group', { name: 'Survey A' }))
  })

  it('says so on the row of a survey it cannot validate for this person', async () => {
    show(bothPublished(), { canValidate: false })
    press('Process file')
    await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(1))
    expect(processedIds()).toEqual(['batch-1'])
    expect(api.validateImport).not.toHaveBeenCalled()
    for (const name of ['Survey A', 'Survey B']) {
      const row = await screen.findByRole('group', { name })
      expect(
        within(row).getByText(
          'Ask a Monitoring and Evaluation Officer to check this survey before it is processed.',
        ),
      ).toBeTruthy()
    }
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
})
