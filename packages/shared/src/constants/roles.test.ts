import { describe, expect, it } from 'vitest'

import { APP_ROLES } from './roles'

describe('APP_ROLES', () => {
  it('keeps role values unique', () => {
    expect(new Set(APP_ROLES).size).toBe(APP_ROLES.length)
  })
})
