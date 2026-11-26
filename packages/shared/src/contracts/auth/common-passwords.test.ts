import { describe, expect, it } from 'vitest'

import { commonPasswordMessage, strongPassword } from './auth-requests'
import { commonPasswords, isCommonPassword } from './common-passwords'

// The entry with its first letter in upper case, so it has both letter cases.
const capitalized = (entry: string) => entry.replace(/[a-z]/, (letter) => letter.toUpperCase())

describe('common password list', () => {
  it('holds 3000 distinct lowercase entries', () => {
    expect(commonPasswords.size).toBe(3000)
    for (const entry of commonPasswords) expect(entry).toBe(entry.toLowerCase())
  })

  it('refuses every entry, once capitalized, only for being common, so no entry is unreachable', () => {
    for (const entry of commonPasswords) {
      const password = capitalized(entry)
      expect(isCommonPassword(password)).toBe(true)
      const result = strongPassword.safeParse(password)
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([commonPasswordMessage])
    }
  })
})
