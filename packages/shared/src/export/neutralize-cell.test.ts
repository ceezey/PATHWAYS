import { describe, expect, it } from 'vitest'

import { neutralizeCell } from './neutralize-cell'

describe('neutralizeCell', () => {
  it.each([
    ['+639170000001', "'+639170000001"],
    [' =1', "' =1"],
    ['-5', "'-5"],
    ['@x', "'@x"],
    ['\t=1', "'\t=1"],
    ['\r=1', "'\r=1"],
    ['=1+1', "'=1+1"],
  ])('quotes %j', (value, expected) => {
    expect(neutralizeCell(value)).toBe(expected)
  })

  it.each(['Ana', '', '5-3', 'a=b', "'=1"])('leaves %j as is', (value) => {
    expect(neutralizeCell(value)).toBe(value)
  })
})
