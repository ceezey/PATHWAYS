import type {
  ApproveGuardianConsentRequest,
  AutomaticImportMappingRequest,
  ImportBatchDetailResponse,
  ImportBatchResponse,
  ImportRowResponse,
  ImportRowReviewResponse,
  ImportRowsPageResponse,
  ProcessImportRequest,
  RerunImportRequest,
  ResolveImportRowRequest,
  SaveImportMappingRequest,
  ValidateImportRequest,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type { ImportMappingInput } from '@/types/pathways'

import { parseAutomaticMappingReceipt } from './imports.schema'

const heldPage = 100

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

  // Every row a person must decide, read a page at a time so none is out of reach.
  async getHeldRows(projectId: string, batchId: string) {
    const rows: ImportRowResponse[] = []
    for (let offset = 0; ; offset += heldPage) {
      const page = (await requestFoundation(
        `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/rows?held=true&offset=${offset}&take=${heldPage}`,
      )) as ImportRowsPageResponse
      rows.push(...page.rows)
      if (page.rows.length < heldPage || offset + heldPage >= page.total) return rows
    }
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

  async getRowReview(projectId: string, batchId: string, rowId: string) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/rows/${encodeURIComponent(rowId)}/review`,
    ) as Promise<ImportRowReviewResponse>
  },

  async resolveRow(
    projectId: string,
    batchId: string,
    rowId: string,
    body: ResolveImportRowRequest,
  ) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/rows/${encodeURIComponent(rowId)}/resolve`,
      { method: 'POST', body: JSON.stringify(body) },
    ) as Promise<{ status: 'PROCESSED' }>
  },

  async approveGuardianConsent(
    projectId: string,
    batchId: string,
    body: ApproveGuardianConsentRequest,
  ) {
    return requestFoundation(
      `/imports/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/guardian-approvals`,
      { method: 'POST', body: JSON.stringify(body) },
    ) as Promise<{ approved: number }>
  },
}
