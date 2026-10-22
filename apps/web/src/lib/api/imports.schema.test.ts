import { describe, expect, it } from 'vitest'
import { parseAutomaticMappingReceipt } from './imports.schema'
const batchId = '50000000-0000-4000-8000-000000000005'
const receipt = {
  batchId,
  mappingRevision: 1,
  mapped: 2,
  pending: 1,
  ignored: 1,
  requiredUnmapped: 1,
  complete: false,
  coverage: 'NOT_COVERED',
  uncoveredColumns: 1,
  unresolvedValues: 2,
}
const covered = {
  ...receipt,
  pending: 0,
  requiredUnmapped: 0,
  complete: true,
  coverage: 'COVERED',
  uncoveredColumns: 0,
  unresolvedValues: 0,
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
    { ...receipt, ignored: -1 },
    { ...receipt, ignored: undefined },
    { ...receipt, coverage: 'MAYBE' },
    { ...receipt, unresolvedValues: 0.5 },
    { ...covered, pending: 1, complete: false },
    { ...covered, complete: false },
    { ...covered, uncoveredColumns: 1 },
    { ...covered, unresolvedValues: 1 },
    { ...covered, mapped: 100, pending: 0, ignored: 401 },
  ])('rejects unsafe receipts %#', (value) =>
    expect(() => parseAutomaticMappingReceipt(value, batchId)).toThrow(),
  )
  it('the web parser rejects COVERED with pending > 0', () =>
    expect(() =>
      parseAutomaticMappingReceipt({ ...receipt, coverage: 'COVERED' }, batchId),
    ).toThrow())
  it('accepts a COVERED receipt only when complete with nothing open', () =>
    expect(parseAutomaticMappingReceipt(covered, batchId)).toEqual(covered))
  it('rejects cross-batch receipts', () =>
    expect(() =>
      parseAutomaticMappingReceipt(receipt, '50000000-0000-4000-8000-000000000006'),
    ).toThrow())
})
