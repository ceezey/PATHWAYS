/* @vitest-environment jsdom */
import { IMPORT_ENGINEERING_LIMITS, toWorkbookBytes } from '@pathways/imports'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DigitalFormDefinition } from '@/types/pathways'

import { useBatchReview } from './use-batch-review'
import type { ImportState } from './use-import-state'

const api = vi.hoisted(() => ({
  uploadImport: vi.fn(),
  getImportBatches: vi.fn(),
  getImportBatch: vi.fn(),
  getImportRows: vi.fn(),
}))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
const draft = vi.hoisted(() => ({ draftFromImport: vi.fn() }))
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('@/lib/api/forms', () => ({ formsClient: draft }))
vi.mock('sonner', () => ({ toast: toasts }))

const field = (code: string, label: string, dataType: string, required = false) => ({
  id: `id-${code}`,
  code,
  label,
  dataType,
  required,
  metadataKey: false,
  sadddField: false,
  allowedValues: null,
  minimumLength: null,
  maximumLength: null,
  sequence: 1,
})
const form = {
  id: 'form-1',
  projectId: 'project-1',
  status: 'PUBLISHED',
  formType: 'ACTIVITY',
  fields: [field('first_name', 'First Name', 'TEXT', true), field('score', 'Score', 'INTEGER')],
} as unknown as DigitalFormDefinition

const upload = vi.fn()
// jsdom's File has no arrayBuffer, so the bytes are handed over directly.
const workbook = (rows: string[][]) => {
  const bytes = new Uint8Array(toWorkbookBytes(rows, 'xlsx'))
  const file = new File([bytes], 'people.xlsx')
  file.arrayBuffer = async () => bytes.buffer
  return file
}
const clean = () =>
  workbook([
    ['First Name', 'Score'],
    ['Ana', '3'],
  ])
// The score column has text where a number belongs, so the row would be held for review.
const held = () =>
  workbook([
    ['First Name', 'Score'],
    ['Ana', 'abc'],
  ])
// The form requires First Name and the file has no such column.
const noColumn = () => workbook([['Score'], ['3']])

function setup(
  initial: File | null,
  sheets: { names: string[]; chosen: string } = { names: [], chosen: '' },
  canManageForms = true,
  mapped: { mappingRevision: number } | null = null,
) {
  return renderHook(() => {
    const [file, setFile] = useState<File | null>(initial)
    const [checking, setChecking] = useState(false)
    const [fileCheck, setFileCheck] = useState<ImportState['fileCheck']>(null)
    const [pending, setPending] = useState(false)
    const [draftTarget, setDraftTarget] = useState<ImportState['draftTarget']>(null)
    const [formOfferSeen, setFormOfferSeen] = useState<ImportState['formOfferSeen']>(new Set())
    const [mutation] = useState({ current: null as object | null })
    const state = {
      batch: null,
      canManageForms,
      draftTarget,
      formOfferSeen,
      begin: () => {
        if (mutation.current) return null
        mutation.current = {}
        setPending(true)
        return {
          valid: () => true,
          finish: () => {
            mutation.current = null
            setPending(false)
          },
        }
      },
      checking,
      file,
      fileCheck,
      fileInput: { current: null },
      formId: 'form-1',
      forms: [form],
      importBatch: {
        uploadId: () => 'upload-1',
        mapAutomatically: vi.fn().mockResolvedValue(mapped),
        forgetUpload: vi.fn(),
      },
      latest: { current: {} },
      mounted: { current: true },
      mutation,
      projectId: 'project-1',
      setBatch: vi.fn(),
      setBatches: vi.fn(),
      setChecking,
      setDraftTarget,
      setFile,
      setFileCheck,
      setFormOfferSeen,
      setForms: vi.fn(),
      setMapping: vi.fn(),
      setMappingNotice: vi.fn(),
      setReceipts: vi.fn(),
      setRows: vi.fn(),
      setRules: vi.fn(),
      setUploadRefusal: vi.fn(),
      sheetName: sheets.chosen,
      sheetNames: sheets.names,
      pending,
    } as unknown as ImportState
    return { state, review: useBatchReview(state) }
  })
}

describe('upload file check', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.uploadImport.mockResolvedValue({ id: 'batch-1', status: 'STORED' })
    api.getImportBatches.mockResolvedValue([])
    api.getImportBatch.mockResolvedValue({ id: 'batch-1', formId: 'form-1' })
    api.getImportRows.mockResolvedValue({ rows: [] })
  })

  it('a clean file uploads with no dialog', async () => {
    const { result } = setup(clean())
    await act(() => result.current.review.upload())
    expect(api.uploadImport).toHaveBeenCalledTimes(1)
    expect(result.current.state.fileCheck).toBeNull()
  })

  it('a file with held rows opens the dialog and uploads nothing', async () => {
    const { result } = setup(held())
    await act(() => result.current.review.upload())
    expect(api.uploadImport).not.toHaveBeenCalled()
    expect(result.current.state.fileCheck?.problemRows).toBe(1)
    expect(result.current.state.file).not.toBeNull()
  })

  it('Upload anyway uploads once', async () => {
    const { result } = setup(held())
    await act(() => result.current.review.upload())
    await act(() => result.current.review.uploadAnyway())
    expect(api.uploadImport).toHaveBeenCalledTimes(1)
    expect(result.current.state.fileCheck).toBeNull()
  })

  it('Fix the file clears the chosen file', async () => {
    const { result } = setup(held())
    await act(() => result.current.review.upload())
    act(() => result.current.review.fixFile())
    expect(result.current.state.fileCheck).toBeNull()
    expect(result.current.state.file).toBeNull()
  })

  it('closing the dialog keeps the chosen file', async () => {
    const { result } = setup(held())
    await act(() => result.current.review.upload())
    act(() => result.current.review.closeFileCheck())
    expect(result.current.state.fileCheck).toBeNull()
    expect(result.current.state.file).not.toBeNull()
    expect(api.uploadImport).not.toHaveBeenCalled()
  })

  it('an unreadable file uploads as today', async () => {
    const broken = new File([], 'broken.xlsx')
    broken.arrayBuffer = async () => new ArrayBuffer(0)
    const { result } = setup(broken)
    await act(() => result.current.review.upload())
    expect(api.uploadImport).toHaveBeenCalledTimes(1)
    expect(result.current.state.fileCheck).toBeNull()
  })

  it('a file over the byte limit uploads as today without being read', async () => {
    const big = held()
    Object.defineProperty(big, 'size', { value: IMPORT_ENGINEERING_LIMITS.maxBytes + 1 })
    const { result } = setup(big)
    await act(() => result.current.review.upload())
    expect(api.uploadImport).toHaveBeenCalledTimes(1)
  })

  it('reads the sheet the person chose', async () => {
    const names = ['PATHWAYS', 'Other']
    const right = setup(held(), { names, chosen: 'PATHWAYS' })
    await act(() => right.result.current.review.upload())
    expect(right.result.current.state.fileCheck).not.toBeNull()
    // A sheet the workbook does not have cannot be read, so the server decides.
    const wrong = setup(held(), { names, chosen: 'Other' })
    await act(() => wrong.result.current.review.upload())
    expect(wrong.result.current.state.fileCheck).toBeNull()
    expect(api.uploadImport).toHaveBeenCalledTimes(1)
  })

  it('a PDF uploads as today without being read', async () => {
    const { result } = setup(new File(['%PDF'], 'scan.pdf'))
    await act(() => result.current.review.upload())
    expect(api.uploadImport).toHaveBeenCalledTimes(1)
  })

  describe('Prepare form in the dialog', () => {
    beforeEach(() => {
      draft.draftFromImport.mockResolvedValue({ form: { id: 'draft-1', projectId: 'project-1' } })
    })

    it('uploads the file, then drafts from the mapped revision and opens the draft', async () => {
      const { result } = setup(noColumn(), undefined, true, { mappingRevision: 1 })
      await act(() => result.current.review.upload())
      await act(() => result.current.review.prepareFromFile())
      expect(api.uploadImport).toHaveBeenCalledTimes(1)
      expect(draft.draftFromImport).toHaveBeenCalledWith('project-1', 'form-1', 'batch-1', 1)
      expect(result.current.state.draftTarget).toEqual({
        projectId: 'project-1',
        formId: 'draft-1',
      })
      expect(result.current.state.fileCheck).toBeNull()
      expect(result.current.state.file).toBeNull()
    })

    it('a refused draft keeps the upload and leaves Prepare form on the batch to retry', async () => {
      draft.draftFromImport.mockRejectedValue(
        new Error('Every column is already covered by the form.'),
      )
      const { result } = setup(noColumn(), undefined, true, { mappingRevision: 1 })
      await act(() => result.current.review.upload())
      await act(() => result.current.review.prepareFromFile())
      expect(toasts.error).toHaveBeenCalledWith('Every column is already covered by the form.')
      expect(result.current.state.draftTarget).toBeNull()
      expect(result.current.state.file).toBeNull()
      expect(result.current.state.formOfferSeen.size).toBe(0)
    })

    it('does not draft from a file that failed to store', async () => {
      api.uploadImport.mockResolvedValue({
        id: 'batch-1',
        status: 'FAILED',
        storageStatus: 'FAILED',
      })
      const { result } = setup(noColumn())
      await act(() => result.current.review.upload())
      await act(() => result.current.review.prepareFromFile())
      expect(draft.draftFromImport).not.toHaveBeenCalled()
      expect(toasts.error).toHaveBeenCalled()
    })
  })

  describe('Upload anyway and the notice after upload', () => {
    it('remembers the batch when the dialog offered Prepare form', async () => {
      const { result } = setup(noColumn())
      await act(() => result.current.review.upload())
      await act(() => result.current.review.uploadAnyway())
      expect(result.current.state.formOfferSeen.has('batch-1')).toBe(true)
    })

    it('does not remember the batch when the dialog offered only row problems', async () => {
      const { result } = setup(held())
      await act(() => result.current.review.upload())
      await act(() => result.current.review.uploadAnyway())
      expect(result.current.state.formOfferSeen.size).toBe(0)
    })

    it('does not remember the batch for someone who cannot manage forms', async () => {
      const { result } = setup(noColumn(), undefined, false)
      await act(() => result.current.review.upload())
      await act(() => result.current.review.uploadAnyway())
      expect(result.current.state.formOfferSeen.size).toBe(0)
    })
  })

  it('a second click while checking does nothing', async () => {
    const { result } = setup(held())
    await act(async () => {
      const first = result.current.review.upload()
      const second = result.current.review.upload()
      await Promise.all([first, second])
    })
    await waitFor(() => expect(result.current.state.fileCheck).not.toBeNull())
    expect(api.uploadImport).not.toHaveBeenCalled()
  })
})
