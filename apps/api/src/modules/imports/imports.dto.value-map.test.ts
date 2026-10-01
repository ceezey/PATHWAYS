import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'

import { ImportMappingItemDto } from './imports.dto'

const check = (valueMap: unknown, dataType?: string) =>
  validate(
    plainToInstance(ImportMappingItemDto, {
      sourceFieldName: 'column_0001',
      targetFieldCode: 'sex',
      ignored: false,
      dataType,
      valueMap,
    }),
  )

// QAD-T54
describe('mapping value map DTO', () => {
  it('accepts a bounded map and a known data type', async () => {
    expect(await check([{ from: 'M', to: 'Male' }], 'TEXT')).toEqual([])
  })

  it('rejects an oversized map, an unknown type, and formula-like or control text', async () => {
    const many = Array.from({ length: 51 }, (_, index) => ({ from: `k${index}`, to: 'v' }))
    expect(await check(many)).not.toEqual([])
    expect(await check([{ from: 'M', to: 'Male' }], 'JSON')).not.toEqual([])
    expect(await check([{ from: 'M', to: '=HYPERLINK("x")' }])).not.toEqual([])
    expect(await check([{ from: '@SUM(1)', to: 'v' }])).not.toEqual([])
    expect(await check([{ from: 'M', to: '-cmd' }])).not.toEqual([])
    expect(await check([{ from: 'M', to: 'a\u0007b' }])).not.toEqual([])
    expect(await check([{ from: 'M', to: '-5' }])).toEqual([])
  })
})
