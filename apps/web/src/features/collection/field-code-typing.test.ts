import { describe, expect, it } from 'vitest'

import { fieldCodeFromText, fieldCodeWhileTyping } from './digital-form-contract'

describe('field code typing', () => {
  it('keeps a typed underscore until the field loses focus', () => {
    expect(fieldCodeWhileTyping('participation_')).toBe('participation_')
    expect(fieldCodeWhileTyping('participation_date')).toBe('participation_date')
    expect(fieldCodeWhileTyping('Participation Date')).toBe('participation_date')
    expect(fieldCodeFromText('participation_')).toBe('participation')
  })
})
