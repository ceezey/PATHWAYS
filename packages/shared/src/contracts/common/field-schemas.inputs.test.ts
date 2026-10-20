import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { queryInteger, trimmedLowercaseInput } from './field-schemas'

describe('lower-case and query input schemas', () => {
  it('trims and lower-cases a string before validating and leaves other values alone', () => {
    const code = trimmedLowercaseInput(z.string().regex(/^[a-z]+$/))
    expect(code.parse('  SEX ')).toBe('sex')
    expect(code.safeParse(5).success).toBe(false)
  })

  it.each([
    ['7', 7],
    [' 7 ', 7],
    ['0x10', 16],
    ['1e1', 10],
    ['', 0],
  ])('reads the query value %j as %d', (value, expected) => {
    expect(queryInteger(0, 100).parse(value)).toBe(expected)
  })

  it.each([['1.5'], ['abc'], ['-1'], ['101'], [['5']], [{ a: '5' }]])(
    'rejects the query value %j',
    (value) => {
      expect(queryInteger(0, 100).safeParse(value).success).toBe(false)
    },
  )
})
