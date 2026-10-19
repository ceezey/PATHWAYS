import { describe, expect, it } from 'vitest'

import { LOAD_SCALE, loadSeedStatements } from './local-load-seed'

describe('local load seed', () => {
  it('is set-based, sized from the scale and never destructive', () => {
    const sql = loadSeedStatements().join('\n')
    expect(sql).toContain(`generate_series(1, ${LOAD_SCALE.events})`)
    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i)
  })
})
