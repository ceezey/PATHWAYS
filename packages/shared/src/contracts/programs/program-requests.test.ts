import { describe, expect, it } from 'vitest'

import { createProgramRequest } from './program-requests'

const base = { code: 'PRG-1', name: 'Synthetic program', status: 'ONGOING' }

describe('createProgramRequest', () => {
  it('trims and upper-cases the code and trims the name as the DTO did', () => {
    expect(
      createProgramRequest.parse({ ...base, code: ' prg-2026 ', name: '  Synthetic program  ' }),
    ).toEqual({ ...base, code: 'PRG-2026' })
  })

  it.each([
    { code: null },
    { code: 'A' },
    { name: '  ab  ' },
    { endDate: '2026-02-30' },
    { status: 'ACTIVE' },
    { extra: 1 },
  ])('rejects %j', (extra) => {
    expect(createProgramRequest.safeParse({ ...base, ...extra }).success).toBe(false)
  })
})
