// @vitest-environment jsdom

import type { Session } from '@supabase/supabase-js'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { authState, validateRestoredSession } = vi.hoisted(() => ({
  authState: {
    callback: null as ((event: string, session: Session | null) => void) | null,
  },
  validateRestoredSession: vi.fn(),
}))

const auth = {
  onAuthStateChange: vi.fn((callback: (event: string, session: Session | null) => void) => {
    authState.callback = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  }),
  signOut: vi.fn().mockResolvedValue({ error: null }),
}
const client = { auth }

vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => client,
}))
vi.mock('@/lib/supabase/session-restoration', () => ({ validateRestoredSession }))

import { SessionProvider, useSessionContext } from './session-provider'

const session = (accessToken: string, subject = 'user-a') =>
  ({
    access_token: accessToken,
    user: { id: subject, email: `${subject}@example.test` },
  }) as Session

const State = () => {
  const value = useSessionContext()
  return (
    <>
      <output>{`${value.status}:${value.session?.access_token ?? 'none'}`}</output>
      <button type="button" onClick={() => void value.signOut().catch(() => {})}>
        Sign out
      </button>
    </>
  )
}

beforeEach(() => {
  authState.callback = null
  auth.onAuthStateChange.mockClear()
  auth.signOut.mockClear()
  auth.signOut.mockResolvedValue({ error: null })
  window.sessionStorage.clear()
  window.localStorage.clear()
  validateRestoredSession.mockReset()
})

afterEach(() => cleanup())

describe('SessionProvider background validation', () => {
  it('clears sensitive drafts synchronously even when Supabase sign-out fails', async () => {
    validateRestoredSession.mockResolvedValueOnce(session('token-1'))
    auth.signOut.mockResolvedValueOnce({ error: new Error('synthetic failure') } as never)
    render(
      <SessionProvider>
        <State />
      </SessionProvider>,
    )
    await screen.findByText('authenticated:token-1')
    window.sessionStorage.setItem('pathways:sensitive-draft:v1:test', 'private')
    window.sessionStorage.setItem('unrelated', 'keep')
    fireEvent.click(screen.getByText('Sign out'))
    expect(window.sessionStorage.getItem('pathways:sensitive-draft:v1:test')).toBeNull()
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep')
    expect(screen.getByText('unauthenticated:none')).toBeTruthy()
  })
  it('keeps a verified same-subject session mounted until a refreshed token is validated', async () => {
    const initial = session('token-1')
    let resolveRefresh!: (value: Session | null) => void
    validateRestoredSession.mockResolvedValueOnce(initial).mockReturnValueOnce(
      new Promise<Session | null>((resolve) => {
        resolveRefresh = resolve
      }),
    )

    render(
      <SessionProvider>
        <State />
      </SessionProvider>,
    )
    expect(await screen.findByText('authenticated:token-1')).toBeTruthy()

    act(() => authState.callback?.('TOKEN_REFRESHED', session('token-2')))
    await waitFor(() => expect(validateRestoredSession).toHaveBeenCalledTimes(2))
    expect(screen.getByText('authenticated:token-1')).toBeTruthy()
    window.sessionStorage.setItem('pathways:sensitive-draft:v1:test', 'retain')

    resolveRefresh(session('token-2'))
    expect(await screen.findByText('authenticated:token-2')).toBeTruthy()
    expect(window.sessionStorage.getItem('pathways:sensitive-draft:v1:test')).toBe('retain')
  })

  it('fails closed after background validation rejects the retained session', async () => {
    validateRestoredSession.mockResolvedValueOnce(session('token-1')).mockResolvedValueOnce(null)

    render(
      <SessionProvider>
        <State />
      </SessionProvider>,
    )
    expect(await screen.findByText('authenticated:token-1')).toBeTruthy()

    act(() => authState.callback?.('TOKEN_REFRESHED', session('token-2')))
    expect(screen.getByText('authenticated:token-1')).toBeTruthy()
    expect(await screen.findByText('unauthenticated:none')).toBeTruthy()
  })

  it('blocks immediately when an auth event changes subjects', async () => {
    let resolveOtherSubject!: (value: Session | null) => void
    validateRestoredSession.mockResolvedValueOnce(session('token-1')).mockReturnValueOnce(
      new Promise<Session | null>((resolve) => {
        resolveOtherSubject = resolve
      }),
    )

    render(
      <SessionProvider>
        <State />
      </SessionProvider>,
    )
    expect(await screen.findByText('authenticated:token-1')).toBeTruthy()

    act(() => authState.callback?.('SIGNED_IN', session('token-b', 'user-b')))
    expect(screen.getByText('loading:none')).toBeTruthy()

    resolveOtherSubject(session('token-b', 'user-b'))
    expect(await screen.findByText('authenticated:token-b')).toBeTruthy()
  })
})
