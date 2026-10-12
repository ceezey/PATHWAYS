import { describe, expect, it } from 'vitest'

import { plural } from './plural'

describe('plural', () => {
  it('adds an s to every count except exactly one', () => {
    expect(plural(1, 'day')).toBe('1 day')
    expect(plural(0, 'project')).toBe('0 projects')
    expect(plural(2, 'suggestion')).toBe('2 suggestions')
    expect(plural(-1, 'column')).toBe('-1 columns')
    expect(plural(1.5, 'program')).toBe('1.5 programs')
  })
})
