import type {
  AutomaticImportMappingRequest,
  ImportBatchDetailResponse,
  ImportBatchResponse,
  ImportRowsPageResponse,
  ProcessImportRequest,
  RerunImportRequest,
  SaveImportMappingRequest,
  ValidateImportRequest,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type { ImportMappingInput } from '@/types/pathways'

import { parseAutomaticMappingReceipt } from './imports.schema'

export const importsClient = {
  async getImportBatches(projectId: string) {
    const value = await requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches`,
    )
    if (!Array.isArray(value) || value.length > 100) {
      throw new PathwaysClientError('Invalid import batch response.', 'network')
    }
    return value as ImportBatchResponse[]
  },

  async getImportBatch(projectId: string, batchId: string) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}`,
    ) as Promise<ImportBatchDetailResponse>
  },

  async getImportRows(projectId: string, batchId: string) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/rows?offset=0&take=100`,
    ) as Promise<ImportRowsPageResponse>
  },

  async uploadImport(
    projectId: string,
    formId: string,
    clientImportId: string,
    file: File,
    sheetName?: string,
  ) {
    const body = new FormData()
    body.set('formId', formId)
    body.set('clientImportId', clientImportId)
    if (sheetName) body.set('sheetName', sheetName)
    body.set('file', file, file.name)
    return requestFoundation(`/imports/projects/${encodeURIComponent(projectId)}/batches/upload`, {
      method: 'POST',
      body,
    }) as Promise<ImportBatchResponse>
  },

  async resumeImportUpload(projectId: string, batchId: string) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/resume`,
      { method: 'POST' },
    ) as Promise<ImportBatchResponse>
  },

  async rerunImport(projectId: string, batchId: string, formId: string) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/rerun`,
      { method: 'POST', body: JSON.stringify({ formId } satisfies RerunImportRequest) },
    ) as Promise<ImportBatchResponse>
  },

  async automaticImportMapping(projectId: string, batchId: string, expectedMappingRevision: 0 | 1) {
    const value = await requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/automatic-mapping`,
      {
        method: 'POST',
        body: JSON.stringify({ expectedMappingRevision } satisfies AutomaticImportMappingRequest),
      },
    )
    try {
      return parseAutomaticMappingReceipt(value, batchId)
    } catch {
      throw new PathwaysClientError('Invalid automatic mapping receipt.', 'network')
    }
  },

  async saveImportMapping(
    projectId: string,
    batchId: string,
    expectedMappingRevision: number,
    mappings: ImportMappingInput[],
  ) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/mapping`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedMappingRevision,
          mappings,
        } satisfies SaveImportMappingRequest),
      },
    ) as Promise<ImportBatchResponse>
  },

  async validateImport(projectId: string, batchId: string, expectedMappingRevision: number) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/validate`,
      {
        method: 'POST',
        body: JSON.stringify({ expectedMappingRevision } satisfies ValidateImportRequest),
      },
    ) as Promise<ImportBatchResponse>
  },

  async processImport(projectId: string, batchId: string, expectedValidationRevision: number) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/process`,
      {
        method: 'POST',
        body: JSON.stringify({ expectedValidationRevision } satisfies ProcessImportRequest),
      },
    ) as Promise<ImportBatchResponse>
  },
}
