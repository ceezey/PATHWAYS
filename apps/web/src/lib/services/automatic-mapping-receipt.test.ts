import { describe, expect, it } from 'vitest'
import { parseAutomaticMappingReceipt } from './automatic-mapping-receipt'
const batchId = '50000000-0000-4000-8000-000000000005'
const receipt = {
  batchId,
  mappingRevision: 1,
  mapped: 2,
  pending: 1,
  requiredUnmapped: 1,
  complete: false,
}
describe('automatic mapping client boundary', () => {
  it('preserves unresolved conservative mapping counts', () =>
    expect(parseAutomaticMappingReceipt(receipt, batchId)).toEqual(receipt))
  it.each([
    { ...receipt, sourceValues: ['private'] },
    { ...receipt, complete: true },
    { ...receipt, pending: 501 },
    { ...receipt, mapped: -1 },
    { ...receipt, mappingRevision: 0 },
  ])('rejects unsafe receipts %#', (value) =>
    expect(() => parseAutomaticMappingReceipt(value, batchId)).toThrow(),
  )
  it('rejects cross-batch receipts', () =>
    expect(() =>
      parseAutomaticMappingReceipt(receipt, '50000000-0000-4000-8000-000000000006'),
    ).toThrow())
})
