import { describe, expect, it } from 'vitest'

import { strongPassword } from './auth-requests'
import { commonPasswords, isCommonPassword } from './common-passwords'

describe('common password list', () => {
  it('holds 3000 lowercase entries that each could pass the staff password rule once capitalized', () => {
    expect(commonPasswords.size).toBe(3000)
    for (const entry of commonPasswords) {
      expect(entry).toBe(entry.toLowerCase())
      expect(entry.length).toBeGreaterThanOrEqual(12)
      expect(entry.length).toBeLessThanOrEqual(128)
      expect(entry).toMatch(/[a-z]/)
      expect(entry).toMatch(/[0-9]/)
      expect(entry).toMatch(/[^a-z0-9]/)
    }
  })

  it('refuses a listed password in any case, so every entry is reachable through the rule', () => {
    const [entry] = commonPasswords
    const capitalized = entry.replace(/[a-z]/, (letter) => letter.toUpperCase())
    expect(isCommonPassword(capitalized)).toBe(true)
    expect(strongPassword.safeParse(capitalized).success).toBe(false)
  })
})
