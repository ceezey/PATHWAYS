import { describe, expect, it } from 'vitest'
import { parseAutomaticMappingReceipt } from './automatic-mapping-receipt'
const batchId = '50000000-0000-4000-8000-000000000005'
const receipt = {
  batchId,
  mappingRevision: 1,
  mapped: 2,
  pending: 0,
  requiredUnmapped: 0,
  complete: true,
}
describe('automatic mapping output allowlist', () => {
  it('returns the exact bounded complete receipt', () =>
    expect(parseAutomaticMappingReceipt(receipt, batchId)).toEqual(receipt))
  it.each([
    { ...receipt, objectKey: 'private' },
    { ...receipt, batchId: 'foreign' },
    { ...receipt, mappingRevision: 2 },
    { ...receipt, pending: 1 },
    { ...receipt, mapped: 0 },
    { ...receipt, mapped: 101 },
    { ...receipt, pending: 501 },
    { ...receipt, requiredUnmapped: 101 },
    { ...receipt, mapped: 0.5 },
  ])('rejects malformed or private receipt data %#', (value) =>
    expect(() => parseAutomaticMappingReceipt(value, batchId)).toThrow(
      'Invalid automatic mapping receipt.',
    ),
  )
})
