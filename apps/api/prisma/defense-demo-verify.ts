import type { PrismaClient } from '@prisma/client'

// PLACEHOLDER: Task 2 supplies the real read-only verifier; take its version when merging.
export type VerifyResult = { check: string; ok: boolean | 'skipped'; detail: string }
export async function verifyDefenseDemo(_owner: PrismaClient): Promise<VerifyResult[]> {
  return [{ check: 'verifier', ok: 'skipped', detail: 'placeholder, not yet merged' }]
}
