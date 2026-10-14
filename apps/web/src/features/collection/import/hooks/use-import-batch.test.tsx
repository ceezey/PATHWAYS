/* @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'
import { useImportBatch } from './use-import-batch'

const api = vi.hoisted(() => ({ automaticImportMapping: vi.fn() }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))

const batch = (mappingRevision: number, storageStatus: string) =>
  ({ id: 'batch-1', mappingRevision, storageStatus }) as ImportBatchDefinition
const file = new File(['a'], 'a.csv')

describe('useImportBatch', () => {
  beforeEach(() => vi.resetAllMocks())

  it('keeps the upload id while every part of the target is unchanged and renews it otherwise', () => {
    const { result } = renderHook(() => useImportBatch())
    const first = result.current.uploadId([file, 'project-1', 'form-1'])
    expect(result.current.uploadId([file, 'project-1', 'form-1'])).toBe(first)
    expect(result.current.uploadId([file, 'project-2', 'form-1'])).not.toBe(first)
    const second = result.current.uploadId([file, 'project-2', 'form-1'])
    expect(result.current.uploadId([new File(['a'], 'a.csv'), 'project-2', 'form-1'])).not.toBe(
      second,
    )
  })

  it('renews the upload id when the target gains a part', () => {
    const { result } = renderHook(() => useImportBatch())
    const first = result.current.uploadId([file])
    expect(result.current.uploadId([file, 'project-1'])).not.toBe(first)
  })

  it('renews the upload id after it is forgotten', () => {
    const { result } = renderHook(() => useImportBatch())
    const first = result.current.uploadId([file, 'project-1'])
    result.current.forgetUpload()
    expect(result.current.uploadId([file, 'project-1'])).not.toBe(first)
  })

  it('keeps the upload id across renders of the same screen', () => {
    const { result, rerender } = renderHook(() => useImportBatch())
    const first = result.current.uploadId([file])
    rerender()
    expect(result.current.uploadId([file])).toBe(first)
  })

  it('maps a stored batch with no mapping revision and returns the receipt', async () => {
    api.automaticImportMapping.mockResolvedValue({ mappingRevision: 1 })
    const { result } = renderHook(() => useImportBatch())
    await expect(result.current.mapAutomatically('project-1', batch(0, 'STORED'))).resolves.toEqual(
      {
        mappingRevision: 1,
      },
    )
    expect(api.automaticImportMapping).toHaveBeenCalledWith('project-1', 'batch-1', 0)
  })

  it.each([batch(1, 'STORED'), batch(0, 'RESERVED'), batch(0, 'RECOVERY_REQUIRED')])(
    'does not map a batch that is not freshly stored (%#)',
    async (value) => {
      const { result } = renderHook(() => useImportBatch())
      await expect(result.current.mapAutomatically('project-1', value)).resolves.toBeNull()
      expect(api.automaticImportMapping).not.toHaveBeenCalled()
    },
  )

  it('starts with no stop requested', () => {
    const { result } = renderHook(() => useImportBatch())
    expect(result.current.stopRequested.current).toBe(false)
  })
})
