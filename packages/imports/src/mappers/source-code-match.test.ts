import { describe, expect, it } from 'vitest'
import { matchBySourceCode } from './source-code-match'

describe('matchBySourceCode', () => {
  it('exact code wins', () => {
    const columns = [
      { key: 'column_0001', sourceCode: 'VFXAUuYgXtm' },
      { key: 'column_0002', sourceCode: 'vfxauuygxtm' },
    ]
    const fields = [
      { code: 'first_name', sourceNames: ['VFXAUuYgXtm', 'Given name'] },
      { code: 'last_name', sourceNames: ['Surname'] },
    ]
    expect([...matchBySourceCode(columns, fields)]).toEqual([['column_0001', 'first_name']])
  })

  it('ambiguous code skipped', () => {
    const columns = [{ key: 'column_0001', sourceCode: 'VFXAUuYgXtm' }]
    const fields = [
      { code: 'first_name', sourceNames: ['VFXAUuYgXtm'] },
      { code: 'last_name', sourceNames: ['VFXAUuYgXtm'] },
    ]
    expect(matchBySourceCode(columns, fields).size).toBe(0)
  })

  it('columns without code ignored', () => {
    const columns = [{ key: 'column_0001' }, { key: 'column_0002', sourceCode: 'Missing_code' }]
    const fields = [{ code: 'first_name', sourceNames: ['Given name'] }, { code: 'sex' }]
    expect(matchBySourceCode(columns, fields).size).toBe(0)
  })

  it('a code repeated by two columns is skipped', () => {
    const columns = [
      { key: 'column_0001', sourceCode: 'VFXAUuYgXtm' },
      { key: 'column_0002', sourceCode: 'VFXAUuYgXtm' },
    ]
    const fields = [{ code: 'first_name', sourceNames: ['VFXAUuYgXtm'] }]
    expect(matchBySourceCode(columns, fields).size).toBe(0)
  })
})
