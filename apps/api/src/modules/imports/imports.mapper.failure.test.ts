import { describe, expect, it } from 'vitest'

import { type BatchRow, mapBatch } from './imports.mapper'

const batch = (patch: Partial<BatchRow>) =>
  ({
    id: 'batch-1',
    form: { code: 'registration', name: 'Registration', formType: 'BENEFICIARY_REGISTRATION' },
    uploadedAt: new Date('2026-10-24T00:00:00Z'),
    updatedAt: new Date('2026-10-24T00:00:00Z'),
    validationNotes: 'Cell A2 has a formula with no saved value.',
    ...patch,
  }) as BatchRow

describe('import batch failure message', () => {
  it('returns the stored parser message only while the batch is FAILED', () => {
    expect(mapBatch(batch({ status: 'FAILED' }), 0, 'actor').failureMessage).toBe(
      'Cell A2 has a formula with no saved value.',
    )
    expect(mapBatch(batch({ status: 'UPLOADED' }), 0, 'actor').failureMessage).toBeNull()
  })
})
