import { describe, expect, it } from 'vitest'

import { type ValidateImportRequest, validateImportRequest } from './import-requests'

describe('validateImportRequest', () => {
  it('accepts a positive integer mapping revision', () => {
    const body: ValidateImportRequest = validateImportRequest.parse({ expectedMappingRevision: 3 })
    expect(body).toEqual({ expectedMappingRevision: 3 })
  })

  it.each([
    { expectedMappingRevision: 0 },
    { expectedMappingRevision: 1.5 },
    { expectedMappingRevision: '2' },
    {},
    { expectedMappingRevision: 1, extra: true },
    JSON.parse('{"expectedMappingRevision":1,"__proto__":{"x":1}}'),
    { expectedMappingRevision: 1, constructor: { x: 1 } },
  ])('rejects %j', (body) => {
    expect(validateImportRequest.safeParse(body).success).toBe(false)
  })
})
