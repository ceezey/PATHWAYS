import { describe, expect, it, vi } from 'vitest'

import type { Tx } from '../../common/prisma/transaction'
import { generateBeneficiaryCode } from './beneficiary-code'

const organizationId = '10000000-0000-4000-8000-000000000001'

const txWith = (findUnique: ReturnType<typeof vi.fn>) =>
  ({ beneficiary: { findUnique } }) as unknown as Tx

describe('generateBeneficiaryCode', () => {
  it('returns PW plus 10 Crockford characters that fit the code pattern', async () => {
    const findUnique = vi.fn(async () => null)
    const code = await generateBeneficiaryCode(txWith(findUnique), organizationId)
    expect(code).toMatch(/^PW[0-9A-HJKMNP-TV-Z]{10}$/)
    expect(code).toMatch(/^[A-Z0-9][A-Z0-9_-]{1,39}$/)
    expect(findUnique).toHaveBeenCalledWith({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true },
    })
  })

  it('retries up to 3 times on an existing code, then gives up', async () => {
    const taken = vi.fn(async () => ({ id: 'x' }))
    await expect(generateBeneficiaryCode(txWith(taken), organizationId)).rejects.toThrow(
      'A participant code could not be generated.',
    )
    expect(taken).toHaveBeenCalledTimes(4)
    const thirdTime = vi
      .fn()
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValueOnce({ id: 'x' })
      .mockResolvedValue(null)
    await expect(generateBeneficiaryCode(txWith(thirdTime), organizationId)).resolves.toMatch(/^PW/)
  })
})
