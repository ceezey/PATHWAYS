// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
}))

import { PathwaysClientError } from '@/lib/api/core/request'
import { importsClient } from './imports'

const projectId = '80200000-0000-4000-8000-000000000001'
const batchId = '80200000-0000-4000-8000-000000000002'
const formId = '80200000-0000-4000-8000-000000000003'
const clientImportId = '80200000-0000-4000-8000-000000000004'
const batchesPath = `/imports/projects/${projectId}/batches`
const batchPath = `${batchesPath}/${batchId}`

describe('importsClient import requests', () => {
  beforeEach(() => {
    request.requestFoundation.mockReset()
  })

  it('lists the batches and refuses an answer that is not a list or holds over 100 batches', async () => {
    request.requestFoundation.mockResolvedValue([{ id: batchId }])
    await expect(importsClient.getImportBatches(projectId)).resolves.toEqual([{ id: batchId }])
    expect(request.requestFoundation).toHaveBeenCalledWith(batchesPath)
  })

  it('accepts exactly 100 batches and refuses 101, null and a string with a network error', async () => {
    const full = Array.from({ length: 100 }, () => ({}))
    request.requestFoundation.mockResolvedValue(full)
    await expect(importsClient.getImportBatches(projectId)).resolves.toBe(full)
    for (const bad of [{}, Array.from({ length: 101 }, () => ({})), null, 'batches']) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(importsClient.getImportBatches(projectId)).rejects.toMatchObject({
        name: 'PathwaysClientError',
        code: 'network',
        message: 'Invalid import batch response.',
      })
    }
  })

  it('lets a request failure through as the same error before any parse', async () => {
    const failure = new PathwaysClientError('x', 'forbidden')
    request.requestFoundation.mockRejectedValue(failure)
    await expect(importsClient.getImportBatches(projectId)).rejects.toBe(failure)
    await expect(importsClient.automaticImportMapping(projectId, batchId, 0)).rejects.toBe(failure)
  })

  it('reads one batch and the first 100 rows by their encoded ids', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await importsClient.getImportBatch(projectId, 'a b')
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchesPath}/a%20b`)
    await importsClient.getImportRows(projectId, batchId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${batchPath}/rows?offset=0&take=100`,
    )
  })

  it('uploads the file with both ids as multipart fields', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    const file = new File(['name\nSample'], 'rows.csv', { type: 'text/csv' })
    await importsClient.uploadImport(projectId, formId, clientImportId, file)
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${batchesPath}/upload`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(init).toEqual({ method: 'POST', body: expect.any(FormData) })
    expect([...init.body.keys()]).toEqual(['formId', 'clientImportId', 'file'])
    expect(init.body.get('formId')).toBe(formId)
    expect(init.body.get('clientImportId')).toBe(clientImportId)
    expect((init.body.get('file') as File).name).toBe('rows.csv')
  })

  it('resumes a stored upload with no body', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await importsClient.resumeImportUpload(projectId, batchId)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${batchPath}/resume`, {
      method: 'POST',
    })
  })

  it('runs automatic mapping and refuses a receipt for another batch or one that is malformed', async () => {
    const receipt = {
      batchId,
      mappingRevision: 1,
      mapped: 2,
      pending: 1,
      requiredUnmapped: 0,
      complete: false,
    }
    request.requestFoundation.mockResolvedValue(receipt)
    await expect(importsClient.automaticImportMapping(projectId, batchId, 0)).resolves.toEqual(
      receipt,
    )
    expect(request.requestFoundation).toHaveBeenCalledWith(`${batchPath}/automatic-mapping`, {
      method: 'POST',
      body: JSON.stringify({ expectedMappingRevision: 0 }),
    })
    await importsClient.automaticImportMapping(projectId, batchId, 1)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchPath}/automatic-mapping`, {
      method: 'POST',
      body: JSON.stringify({ expectedMappingRevision: 1 }),
    })
    for (const bad of [{ ...receipt, batchId: clientImportId }, { ...receipt, mapped: -1 }, null]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(
        importsClient.automaticImportMapping(projectId, batchId, 1),
      ).rejects.toMatchObject({
        name: 'PathwaysClientError',
        code: 'network',
        message: 'Invalid automatic mapping receipt.',
      })
    }
  })

  it('saves a mapping revision with every decision as sent', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    const mappings = [
      { sourceFieldName: 'column_0001', targetFieldCode: 'name', ignored: false },
      {
        sourceFieldName: 'column_0002',
        ignored: false,
        targetFieldCode: 'sex',
        dataType: 'SELECT' as const,
        valueMap: [{ from: 'M', to: 'Male' }],
      },
      { sourceFieldName: 'column_0003', ignored: true },
    ]
    await importsClient.saveImportMapping(projectId, batchId, 2, mappings)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${batchPath}/mapping`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedMappingRevision: 2, mappings }),
    })
  })

  it('validates against a mapping revision and processes against a validation revision', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await importsClient.validateImport(projectId, batchId, 3)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchPath}/validate`, {
      method: 'POST',
      body: JSON.stringify({ expectedMappingRevision: 3 }),
    })
    await importsClient.processImport(projectId, batchId, 4)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchPath}/process`, {
      method: 'POST',
      body: JSON.stringify({ expectedValidationRevision: 4 }),
    })
  })

  // Every id is 'a b' so each encodeURIComponent shows in the path; init says whether the call carries a second argument.
  const odd = 'a b'
  const batches = '/imports/projects/a%20b/batches'
  const sentinel = { marker: 'response' }
  const upload = new File(['name\nSample'], 'rows.csv', { type: 'text/csv' })
  const calls = [
    {
      name: 'getImportBatches',
      run: () => importsClient.getImportBatches(odd),
      path: batches,
      init: false,
      list: true,
    },
    {
      name: 'getImportBatch',
      run: () => importsClient.getImportBatch(odd, odd),
      path: `${batches}/a%20b`,
      init: false,
    },
    {
      name: 'getImportRows',
      run: () => importsClient.getImportRows(odd, odd),
      path: `${batches}/a%20b/rows?offset=0&take=100`,
      init: false,
    },
    {
      name: 'uploadImport',
      run: () => importsClient.uploadImport(odd, odd, odd, upload),
      path: `${batches}/upload`,
      init: true,
    },
    {
      name: 'resumeImportUpload',
      run: () => importsClient.resumeImportUpload(odd, odd),
      path: `${batches}/a%20b/resume`,
      init: true,
    },
    {
      name: 'automaticImportMapping',
      run: () => importsClient.automaticImportMapping(odd, odd, 0),
      path: `${batches}/a%20b/automatic-mapping`,
      init: true,
      list: true,
    },
    {
      name: 'saveImportMapping',
      run: () => importsClient.saveImportMapping(odd, odd, 2, []),
      path: `${batches}/a%20b/mapping`,
      init: true,
    },
    {
      name: 'validateImport',
      run: () => importsClient.validateImport(odd, odd, 3),
      path: `${batches}/a%20b/validate`,
      init: true,
    },
    {
      name: 'processImport',
      run: () => importsClient.processImport(odd, odd, 4),
      path: `${batches}/a%20b/process`,
      init: true,
    },
  ]

  it('encodes every id into the exact path and passes no argument besides the init', async () => {
    for (const { name, run, path, init } of calls) {
      request.requestFoundation.mockReset()
      request.requestFoundation.mockResolvedValue(sentinel)
      await run().catch(() => undefined)
      const [call] = request.requestFoundation.mock.calls
      expect(call[0], name).toBe(path)
      expect(call, name).toHaveLength(init ? 2 : 1)
    }
  })

  it('returns the response object untouched', async () => {
    request.requestFoundation.mockResolvedValue(sentinel)
    for (const { name, run, list } of calls) {
      if (!list) await expect(run(), name).resolves.toBe(sentinel)
    }
  })
})
