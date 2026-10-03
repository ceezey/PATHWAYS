import { describe, expect, it } from 'vitest'

import { fieldCodeFromText, fieldCodeWhileTyping } from './digital-form-contract'

describe('field code typing', () => {
  it('keeps a typed underscore until the field loses focus', () => {
    expect(fieldCodeWhileTyping('participation_')).toBe('participation_')
    expect(fieldCodeWhileTyping('participation_date')).toBe('participation_date')
    expect(fieldCodeWhileTyping('Participation Date')).toBe('participation_date')
    expect(fieldCodeFromText('participation_')).toBe('participation')
  })

  it('turns a form code like TEST-FORM into one the API accepts', () => {
    expect(fieldCodeWhileTyping('TEST-FORM')).toBe('test_form')
    expect(fieldCodeFromText('TEST-FORM')).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
  })
})
