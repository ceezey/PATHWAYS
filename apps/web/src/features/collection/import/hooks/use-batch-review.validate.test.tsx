/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBatchReview } from './use-batch-review'
import type { ImportState } from './use-import-state'

const api = vi.hoisted(() => ({
  getImportBatch: vi.fn(),
  getImportRows: vi.fn(),
  saveImportMapping: vi.fn(),
  validateImport: vi.fn(),
}))
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/forms', () => ({ formsClient: {} }))
vi.mock('sonner', () => ({ toast: toasts }))

const form = {
  id: 'form-1',
  fields: [
    { code: 'first_name', dataType: 'TEXT' },
    { code: 'birth_date', dataType: 'DATE' },
  ],
}
const column = { key: 'column_0001', header: 'Given name', columnIndex: 1 }
const batch = {
  id: 'batch-1',
  formId: 'form-1',
  mappingRevision: 1,
  sourceColumns: [column],
  mappings: [
    {
      sourceFieldName: 'column_0001',
      status: 'MAPPED',
      targetField: { code: 'first_name' },
      dataType: null,
      valueMap: null,
      dateOrder: null,
    },
  ],
}
const stored = { column_0001: 'first_name' }

const setup = (over: { mapping?: Record<string, string>; rules?: object; editable?: boolean }) => {
  const setMappingNotice = vi.fn()
  const state = {
    batch,
    begin: () => ({ valid: () => true, finish: vi.fn() }),
    forms: [form],
    latest: { current: { batch } },
    mapping: over.mapping ?? stored,
    mappingEditable: over.editable ?? true,
    projectId: 'project-1',
    rules: over.rules ?? {},
    selectedForm: form,
    setBatch: vi.fn(),
    setBatches: vi.fn(),
    setForms: vi.fn(),
    setMapping: vi.fn(),
    setMappingNotice,
    setRows: vi.fn(),
    setRules: vi.fn(),
    sourceColumns: [column],
  } as unknown as ImportState
  return { review: renderHook(() => useBatchReview(state)).result.current, setMappingNotice }
}

describe('Validate rows', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getImportBatch.mockResolvedValue(batch)
    api.getImportRows.mockResolvedValue({ rows: [] })
    api.saveImportMapping.mockResolvedValue({ ...batch, mappingRevision: 2 })
    api.validateImport.mockResolvedValue(batch)
  })

  it('validates an unchanged mapping without adding a revision', async () => {
    const { review } = setup({})
    await act(() => review.validate())
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    expect(api.validateImport).toHaveBeenCalledWith('project-1', 'batch-1', 1)
  })

  it('validates for someone who cannot edit the mapping without saving', async () => {
    const { review } = setup({ editable: false })
    await act(() => review.validate())
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    expect(api.validateImport).toHaveBeenCalledWith('project-1', 'batch-1', 1)
  })

  it('saves a changed target, then validates the new revision', async () => {
    const { review, setMappingNotice } = setup({ mapping: { column_0001: '__ignore__' } })
    await act(() => review.validate())
    expect(api.saveImportMapping).toHaveBeenCalledWith('project-1', 'batch-1', 1, [
      { sourceFieldName: 'column_0001', ignored: true, targetFieldCode: undefined },
    ])
    expect(api.validateImport).toHaveBeenCalledWith('project-1', 'batch-1', 2)
    expect(setMappingNotice).toHaveBeenLastCalledWith('Mapping revision saved and rows validated.')
  })

  it('saves when only a value translation changed', async () => {
    const pairs = [{ from: 'F', to: 'Female' }]
    const { review } = setup({ rules: { column_0001: { dataType: '', pairs } } })
    await act(() => review.validate())
    expect(api.saveImportMapping).toHaveBeenCalledTimes(1)
    expect(api.validateImport).toHaveBeenCalledWith('project-1', 'batch-1', 2)
  })

  it('refuses a reviewer with a pending column before calling the server', async () => {
    const { review } = setup({ mapping: { column_0001: '__pending__' } })
    await act(() => review.validate())
    expect(toasts.error).toHaveBeenCalledWith(
      'Resolve every pending source column before validating.',
    )
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    expect(api.validateImport).not.toHaveBeenCalled()
  })

  it('does not validate when the save fails', async () => {
    api.saveImportMapping.mockRejectedValue(new Error('Stale revision.'))
    const { review } = setup({ mapping: { column_0001: '__ignore__' } })
    await act(() => review.validate())
    expect(toasts.error).toHaveBeenCalledWith('Stale revision.')
    expect(api.validateImport).not.toHaveBeenCalled()
    expect(api.getImportBatch).not.toHaveBeenCalled()
  })

  it('reloads the saved revision when validation refuses it, so a retry is not stale', async () => {
    api.validateImport.mockRejectedValue(new Error('The reviewed mapping is incomplete.'))
    const { review, setMappingNotice } = setup({ mapping: { column_0001: '__ignore__' } })
    await act(() => review.validate())
    expect(toasts.error).toHaveBeenCalledWith('The reviewed mapping is incomplete.')
    expect(setMappingNotice).toHaveBeenCalledWith(
      'Mapping revision saved, but the rows were not validated.',
    )
    expect(api.getImportBatch).toHaveBeenCalledWith('project-1', 'batch-1')
  })
})
