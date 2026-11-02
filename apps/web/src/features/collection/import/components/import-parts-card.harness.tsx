import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'

import { ImportPartsCard } from './import-parts-card'

const counts = { rows: 4, valid: 4, invalid: 0, processed: 0, unprocessed: 0, failed: 0 }
export const totals = { ...counts, warnings: 0, waiting: 0 }
const partDefs = [
  { code: 'survey_a', name: 'Survey A' },
  { code: 'survey_b', name: 'Survey B' },
]

export const child = (code: string, over: Record<string, unknown> = {}) =>
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

export const part = (
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

export const registration = (parts: unknown[]) =>
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

export const mapAutomatically = vi.fn()
export const review = { loadBatch: vi.fn() }
export const setDraftTarget = vi.fn()

// Like the real one, a second call is refused until the first has finished.
let busy = false
export const unlock = () => {
  busy = false
}
const begin = () => {
  if (busy) return null
  busy = true
  return {
    valid: () => true,
    finish: () => {
      busy = false
    },
  }
}

const stateWith = (batch: ImportBatchDefinition, over: Record<string, unknown>) => ({
  batch,
  projectId: 'project-1',
  canManageForms: true,
  canUpload: true,
  canValidate: true,
  canProcess: true,
  pending: false,
  begin,
  importBatch: { stopRequested: { current: false }, mapAutomatically },
  setProcessing: vi.fn(),
  setDraftTarget,
  ...over,
})

export const show = (batch: ImportBatchDefinition, over: Record<string, unknown> = {}) => {
  const card = (current: ImportBatchDefinition) => (
    <ImportPartsCard
      batch={current}
      review={review as never}
      state={stateWith(current, over) as never}
    />
  )
  const view = render(card(batch))
  return { ...view, update: (next: ImportBatchDefinition) => view.rerender(card(next)) }
}

export const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

/** The happy-path answers every card test starts from. */
export function defaultAnswers(api: Record<string, ReturnType<typeof vi.fn>>) {
  unlock()
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
}
