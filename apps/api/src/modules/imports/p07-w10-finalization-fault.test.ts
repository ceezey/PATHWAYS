import { describe, expect, it } from 'vitest'
import {
  type W10FinalizationCandidate,
  W10FinalizationFault,
  W10_CLIENT_IMPORT_ID,
  W10_SOURCE_SHA256,
} from './p07-w10-finalization-fault'

const candidate: W10FinalizationCandidate = {
  organizationId: '7541cfc6-541d-4057-9229-03d89d361d34',
  projectId: 'f284d573-c248-4e38-ae0b-115b44190909',
  formId: '70da2b64-42c5-4c05-8c88-5c4b814f885e',
  clientImportId: W10_CLIENT_IMPORT_ID,
  sourceChecksum: W10_SOURCE_SHA256,
  storageBucket: 'pathways-private',
  storageStatus: 'RESERVED',
  status: 'UPLOADING',
  totalRows: 0,
}

const enabled = {
  NODE_ENV: 'development',
  SUPABASE_URL: 'https://pdqwsknbzkdtiwjjibqt.supabase.co',
  P07_W10_FAIL_FINALIZATION_ONCE: W10_CLIENT_IMPORT_ID,
}

describe('P07 W10 one-shot upload finalization fault', () => {
  it('fires only once for the exact synthetic batch', () => {
    const fault = new W10FinalizationFault()
    expect(fault.consume(candidate, enabled)).toBe(true)
    expect(fault.consume(candidate, enabled)).toBe(false)
  })

  it('cannot run in production or without the explicit development opt-in', () => {
    expect(
      new W10FinalizationFault().consume(candidate, { ...enabled, NODE_ENV: 'production' }),
    ).toBe(false)
    expect(new W10FinalizationFault().consume(candidate, { ...enabled, NODE_ENV: 'test' })).toBe(
      false,
    )
    expect(
      new W10FinalizationFault().consume(candidate, {
        ...enabled,
        P07_W10_FAIL_FINALIZATION_ONCE: undefined,
      }),
    ).toBe(false)
    expect(
      new W10FinalizationFault().consume(candidate, {
        ...enabled,
        SUPABASE_URL: 'https://different.supabase.co',
      }),
    ).toBe(false)
  })

  it.each([
    { clientImportId: '30000000-0000-4000-8000-000000000003' },
    { organizationId: '30000000-0000-4000-8000-000000000003' },
    { projectId: '30000000-0000-4000-8000-000000000003' },
    { formId: '30000000-0000-4000-8000-000000000003' },
    { sourceChecksum: 'a'.repeat(64) },
    { storageBucket: 'other-bucket' },
    { storageStatus: 'STORED' },
    { status: 'RECOVERY_REQUIRED' },
    { totalRows: 1 },
  ])('does not consume on unrelated or already recovered batches: %j', (change) => {
    const fault = new W10FinalizationFault()
    expect(fault.consume({ ...candidate, ...change }, enabled)).toBe(false)
    expect(fault.consume(candidate, enabled)).toBe(true)
  })
})
