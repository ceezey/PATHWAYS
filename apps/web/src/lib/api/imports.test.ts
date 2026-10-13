// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
}))

import { pathwaysClient } from '@/lib/services/pathways-client'
import { importsClient } from './imports'

const projectId = '80200000-0000-4000-8000-000000000001'
const batchId = '80200000-0000-4000-8000-000000000002'
const formId = '80200000-0000-4000-8000-000000000003'
const clientImportId = '80200000-0000-4000-8000-000000000004'
const batchesPath = `/imports/projects/${projectId}/batches`
const batchPath = `${batchesPath}/${batchId}`

// The same cases run against the method still on pathwaysClient and against its copy in importsClient.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['importsClient', importsClient],
] as const

describe.each(clients)('%s import requests', (_name, client) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('lists the batches and refuses an answer that is not a list or holds over 100 batches', async () => {
    request.requestFoundation.mockResolvedValue([{ id: batchId }])
    await expect(client.getImportBatches(projectId)).resolves.toEqual([{ id: batchId }])
    expect(request.requestFoundation).toHaveBeenCalledWith(batchesPath)
    for (const bad of [{}, Array.from({ length: 101 }, () => ({}))]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(client.getImportBatches(projectId)).rejects.toThrow(
        'Invalid import batch response.',
      )
    }
  })

  it('reads one batch and the first 100 rows by their encoded ids', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await client.getImportBatch(projectId, 'a b')
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchesPath}/a%20b`)
    await client.getImportRows(projectId, batchId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${batchPath}/rows?offset=0&take=100`,
    )
  })

  it('uploads the file with both ids as multipart fields', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    const file = new File(['name\nSample'], 'rows.csv', { type: 'text/csv' })
    await client.uploadImport(projectId, formId, clientImportId, file)
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${batchesPath}/upload`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect([...init.body.keys()]).toEqual(['formId', 'clientImportId', 'file'])
    expect(init.body.get('formId')).toBe(formId)
    expect(init.body.get('clientImportId')).toBe(clientImportId)
    expect((init.body.get('file') as File).name).toBe('rows.csv')
  })

  it('resumes a stored upload with no body', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await client.resumeImportUpload(projectId, batchId)
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
    await expect(client.automaticImportMapping(projectId, batchId, 0)).resolves.toEqual(receipt)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${batchPath}/automatic-mapping`, {
      method: 'POST',
      body: JSON.stringify({ expectedMappingRevision: 0 }),
    })
    for (const bad of [{ ...receipt, batchId: clientImportId }, { ...receipt, mapped: -1 }, null]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(client.automaticImportMapping(projectId, batchId, 1)).rejects.toThrow(
        'Invalid automatic mapping receipt.',
      )
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
    await client.saveImportMapping(projectId, batchId, 2, mappings)
    expect(request.requestFoundation).toHaveBeenCalledWith(`${batchPath}/mapping`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedMappingRevision: 2, mappings }),
    })
  })

  it('validates against a mapping revision and processes against a validation revision', async () => {
    request.requestFoundation.mockResolvedValue({ id: batchId })
    await client.validateImport(projectId, batchId, 3)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchPath}/validate`, {
      method: 'POST',
      body: JSON.stringify({ expectedMappingRevision: 3 }),
    })
    await client.processImport(projectId, batchId, 4)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${batchPath}/process`, {
      method: 'POST',
      body: JSON.stringify({ expectedValidationRevision: 4 }),
    })
  })
})
