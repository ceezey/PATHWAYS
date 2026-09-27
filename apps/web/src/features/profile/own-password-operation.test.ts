import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { bindPasswordSession, currentContinuation } from './own-password-operation'

describe('password account binding', () => {
  it('does not continue a pending verification after account, grant or mounted ownership changes', async () => {
    for (const reason of ['account', 'grant', 'unmount']) {
      let current = true
      let complete!: (value: string) => void
      const pending = new Promise<string>((resolve) => {
        complete = resolve
      })
      const nextMutation = vi.fn()
      const { step, assertCurrent } = currentContinuation(() => current)
      const operation = (async () => {
        await step(() => pending)
        assertCurrent()
        nextMutation(reason)
      })()
      current = false
      complete('verified')
      await expect(operation).rejects.toThrow('stale')
      expect(nextMutation).not.toHaveBeenCalled()
    }
  })

  it('rejects an isolated SDK session whose online user differs from the captured account', async () => {
    const captured = {
      access_token: 'test-access',
      refresh_token: 'test-refresh',
      user: { id: 'original' },
    } as Session
    const client = {
      auth: {
        setSession: vi.fn().mockResolvedValue({ error: null, data: { user: { id: 'original' } } }),
        getUser: vi.fn().mockResolvedValue({ error: null, data: { user: { id: 'switched' } } }),
      },
    } as unknown as SupabaseClient
    await expect(bindPasswordSession(client, captured, () => true)).rejects.toThrow('verification')
  })

  it('never reads online user after captured ownership becomes stale during session binding', async () => {
    let current = true
    const client = {
      auth: {
        setSession: vi.fn().mockImplementation(async () => {
          current = false
          return { error: null, data: { user: { id: 'original' } } }
        }),
        getUser: vi.fn(),
      },
    } as unknown as SupabaseClient
    const captured = {
      access_token: 'test-access',
      refresh_token: 'test-refresh',
      user: { id: 'original' },
    } as Session
    await expect(bindPasswordSession(client, captured, () => current)).rejects.toThrow('stale')
    expect(client.auth.getUser).not.toHaveBeenCalled()
  })
})
