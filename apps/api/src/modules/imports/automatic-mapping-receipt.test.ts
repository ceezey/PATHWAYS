import { describe, expect, it } from 'vitest'
import { parseAutomaticMappingReceipt } from './automatic-mapping-receipt'
const batchId = '50000000-0000-4000-8000-000000000005'
const receipt = {
  batchId,
  mappingRevision: 1,
  mapped: 2,
  pending: 0,
  ignored: 1,
  requiredUnmapped: 0,
  complete: true,
  coverage: 'COVERED',
  uncoveredColumns: 0,
  unresolvedValues: 0,
}
describe('automatic mapping output allowlist', () => {
  it('returns the exact bounded complete receipt', () =>
    expect(parseAutomaticMappingReceipt(receipt, batchId)).toEqual(receipt))
  it('allows NOT_COVERED with open counts', () => {
    const open = { ...receipt, coverage: 'NOT_COVERED', uncoveredColumns: 2, unresolvedValues: 3 }
    expect(parseAutomaticMappingReceipt(open, batchId)).toEqual(open)
  })
  it('rejects COVERED when not complete', () =>
    expect(() =>
      parseAutomaticMappingReceipt({ ...receipt, pending: 1, complete: false }, batchId),
    ).toThrow('Invalid automatic mapping receipt.'))
  it.each([
    { ...receipt, objectKey: 'private' },
    { ...receipt, batchId: 'foreign' },
    { ...receipt, mappingRevision: 2 },
    { ...receipt, pending: 1 },
    { ...receipt, mapped: 101 },
    { ...receipt, pending: 501 },
    { ...receipt, coverage: 'NOT_COVERED', complete: false, pending: 501 },
    { ...receipt, mapped: 100, pending: 400, ignored: 1, complete: false, coverage: 'NOT_COVERED' },
    { ...receipt, ignored: -1 },
    { ...receipt, coverage: 'MAYBE' },
    { ...receipt, uncoveredColumns: 1 },
    { ...receipt, unresolvedValues: 1 },
    { ...receipt, unresolvedValues: 0.5, coverage: 'NOT_COVERED' },
    { ...receipt, ignored: undefined },
    { ...receipt, mapped: 0, ignored: 0 },
    { ...receipt, requiredUnmapped: 101 },
    { ...receipt, mapped: 0.5 },
  ])('rejects malformed or private receipt data %#', (value) =>
    expect(() => parseAutomaticMappingReceipt(value, batchId)).toThrow(
      'Invalid automatic mapping receipt.',
    ),
  )
})
