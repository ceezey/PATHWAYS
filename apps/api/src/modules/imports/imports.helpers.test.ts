import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { safeSourceColumns } from './imports.helpers'

const column = (patch: Record<string, unknown> = {}) => ({
  key: 'column_0001',
  header: 'Consent to the collection',
  columnIndex: 1,
  ...patch,
})
const parse = (value: unknown) => safeSourceColumns(value as Prisma.JsonValue)

describe('safeSourceColumns source codes', () => {
  it('keeps a valid source code and leaves a column without one unchanged', () => {
    expect(parse([column({ sourceCode: 'VFXAUuYgXtm' })])).toEqual([
      column({ sourceCode: 'VFXAUuYgXtm' }),
    ])
    expect(parse([column()])).toEqual([column()])
  })

  it('rejects a source code of another type or pattern', () => {
    for (const sourceCode of [5, null, '', 'a', '1abc', 'has space', 'x'.repeat(41)]) {
      expect(() => parse([column({ sourceCode })])).toThrow('Stored import source columns')
    }
  })
})
