import { describe, expect, it } from 'vitest'
import { comparableAnswer, hasLetterPrefix, resolveAnswer, stripLetterPrefix } from './answers'

const OPTIONS = ['Hindi', 'Oo - medyo nahihirapan', 'Oo - lubos na nahihirapan']

describe('stripLetterPrefix', () => {
  it('removes letter and number prefixes in any case', () => {
    expect(stripLetterPrefix('10) Iba pa')).toBe('Iba pa')
    expect(stripLetterPrefix('B. Oo')).toBe('Oo')
    expect(stripLetterPrefix('b.  oo')).toBe('oo')
  })

  it('leaves text without a spaced prefix alone', () => {
    expect(stripLetterPrefix('A.Babae')).toBe('A.Babae')
    expect(stripLetterPrefix('Ana')).toBe('Ana')
  })
})

describe('hasLetterPrefix', () => {
  it('detects only prefixes followed by whitespace', () => {
    expect(hasLetterPrefix('A. Babae')).toBe(true)
    expect(hasLetterPrefix('3) Iba pa')).toBe(true)
    expect(hasLetterPrefix('Ana')).toBe(false)
    expect(hasLetterPrefix('A.Babae')).toBe(false)
  })
})

describe('comparableAnswer', () => {
  it('folds case, dash variants and whitespace runs', () => {
    expect(comparableAnswer('  Oo –  Medyo\tnahihirapan ')).toBe('oo - medyo nahihirapan')
    expect(comparableAnswer('a—b‒c−d‐e')).toBe('a-b-c-d-e')
  })
})

describe('resolveAnswer', () => {
  it('resolves en dash and spacing variants to the allowed value', () => {
    const expected = 'Oo - medyo nahihirapan'
    expect(resolveAnswer('B. Oo – medyo nahihirapan', OPTIONS, [])).toBe(expected)
    expect(resolveAnswer('b.  OO - medyo nahihirapan', OPTIONS, [])).toBe(expected)
  })

  it('returns an exact allowed value as is', () => {
    expect(resolveAnswer('Hindi', OPTIONS, [])).toBe('Hindi')
  })

  it('resolves through an alias on the comparable text', () => {
    expect(
      resolveAnswer('a. babae', ['FEMALE', 'MALE'], [{ from: 'A. Babae', to: 'FEMALE' }]),
    ).toBe('FEMALE')
  })

  it('returns null for unknown text', () => {
    expect(resolveAnswer('Siguro', OPTIONS, [])).toBeNull()
  })
})
