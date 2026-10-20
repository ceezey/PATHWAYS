/** A one-shot fault for the approved W10 synthetic upload only. Never active in production. */
export const W10_CLIENT_IMPORT_ID = '0f4060ce-8432-4fd4-b9f2-91edd4503ec8'
export const W10_SOURCE_SHA256 = 'bf783e5aaf7a25fefd5d2e5c29813a037494f479d953dc5ac08610e475b887b8'

const W10_ORGANIZATION_ID = '7541cfc6-541d-4057-9229-03d89d361d34'
const W10_PROJECT_ID = 'f284d573-c248-4e38-ae0b-115b44190909'
const W10_FORM_ID = '70da2b64-42c5-4c05-8c88-5c4b814f885e'
const W10_DEV_SUPABASE_URL = 'https://pdqwsknbzkdtiwjjibqt.supabase.co'

export interface W10FinalizationCandidate {
  organizationId: string
  projectId: string
  formId: string
  clientImportId: string
  sourceChecksum: string
  storageBucket: string
  storageStatus: string
  status: string
  totalRows: number
}

export class W10FinalizationFault {
  private consumed = false

  consume(candidate: W10FinalizationCandidate, environment: NodeJS.ProcessEnv = process.env) {
    if (this.consumed) return false
    if (environment.NODE_ENV !== 'development') return false
    if (environment.SUPABASE_URL !== W10_DEV_SUPABASE_URL) return false
    if (environment.P07_W10_FAIL_FINALIZATION_ONCE !== W10_CLIENT_IMPORT_ID) return false
    if (
      candidate.organizationId !== W10_ORGANIZATION_ID ||
      candidate.projectId !== W10_PROJECT_ID ||
      candidate.formId !== W10_FORM_ID ||
      candidate.clientImportId !== W10_CLIENT_IMPORT_ID ||
      candidate.sourceChecksum !== W10_SOURCE_SHA256 ||
      candidate.storageBucket !== 'pathways-private' ||
      candidate.storageStatus !== 'RESERVED' ||
      candidate.status !== 'UPLOADING' ||
      candidate.totalRows !== 0
    )
      return false
    this.consumed = true
    return true
  }
}
