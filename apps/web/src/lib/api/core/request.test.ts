// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))

import { sourceMutationTickets } from '@/lib/api/core/source-mutation'
import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { PathwaysClientError, requestFoundationResponse } from './request'

const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const operation = 'POST:/projects/synthetic'

describe('requestFoundationResponse', () => {
  it('refuses a request whose ownership already changed', async () => {
    const request = requestFoundationResponse('/synthetic', {}, () => false)
    await expect(request).rejects.toBeInstanceOf(PathwaysClientError)
    await expect(request).rejects.toThrow('Request ownership changed.')
  })

  it('subscribes the source mutation tickets to sensitive draft invalidation when it requests', async () => {
    await expect(
      sourceMutationTickets.execute(
        context,
        operation,
        { title: 'Synthetic' },
        () => Promise.reject(new Error('lost response')),
        (value) => value,
      ),
    ).rejects.toThrow('lost response')
    clearSensitiveDraftStorage()
    expect(sourceMutationTickets.pendingRecovery(context, operation)).not.toBeNull()

    await expect(requestFoundationResponse('/synthetic')).rejects.toMatchObject({
      code: 'not_configured',
    })
    clearSensitiveDraftStorage()
    expect(sourceMutationTickets.pendingRecovery(context, operation)).toBeNull()
  })
})
