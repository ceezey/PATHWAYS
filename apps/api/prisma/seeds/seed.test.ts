import { describe, expect, it, vi } from 'vitest'

import { LEGACY_SEED_DISABLED_MESSAGE, main } from './seed'

describe('legacy seed entry point', () => {
  it('is an explicit no-op until canonical Phase 5 seeding', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await expect(main()).resolves.toBeUndefined()
    expect(info).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledWith(LEGACY_SEED_DISABLED_MESSAGE)
  })
})
