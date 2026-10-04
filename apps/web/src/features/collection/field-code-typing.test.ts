import { describe, expect, it } from 'vitest'

import { fieldCodeFromText, fieldCodeWhileTyping, neatFormCode } from './digital-form-contract'

describe('field code typing', () => {
  it('keeps a typed underscore until the field loses focus', () => {
    expect(fieldCodeWhileTyping('participation_')).toBe('participation_')
    expect(fieldCodeWhileTyping('participation_date')).toBe('participation_date')
    expect(fieldCodeWhileTyping('Participation Date')).toBe('participation_date')
    expect(fieldCodeFromText('participation_')).toBe('participation')
  })

  it('generates a neat form code from the title with a short unique suffix', () => {
    const now = 1_790_000_000_000
    const suffix = now.toString(36).slice(-4)
    expect(neatFormCode('Test Form', now)).toBe(`test_form_${suffix}`)
    expect(neatFormCode('2026 Pre-test', now)).toBe(`form_2026_pre_test_${suffix}`)
    expect(neatFormCode('', now)).toBe(`form_${suffix}`)
    expect(neatFormCode('A'.repeat(90), now)).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
  })

  it('turns a form code like TEST-FORM into one the API accepts', () => {
    expect(fieldCodeWhileTyping('TEST-FORM')).toBe('test_form')
    expect(fieldCodeFromText('TEST-FORM')).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
  })
})
