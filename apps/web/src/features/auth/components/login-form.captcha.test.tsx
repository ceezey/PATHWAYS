/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ siteKey: 'site-key', mounts: 0 }))
const requestSignIn = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ configured: true, status: 'unauthenticated' }),
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { setSession: vi.fn() } }),
}))
vi.mock('../signin-request', () => ({ requestSignIn, formatLockRemaining: () => '0:00' }))
// Stands in for Turnstile: each mount is a fresh widget that hands over its own token.
vi.mock('./captcha-field', async () => {
  const { useState } = await import('react')
  return {
    get captchaSiteKey() {
      return state.siteKey
    },
    CaptchaField: ({ onToken }: { onToken: (token: string) => void }) => {
      const [mount] = useState(() => ++state.mounts)
      return state.siteKey ? (
        <button onClick={() => onToken(`token-${mount}`)} type="button">
          Pass check
        </button>
      ) : null
    },
  }
})

import { LoginForm } from './login-form'

afterEach(() => {
  cleanup()
  requestSignIn.mockReset()
  state.mounts = 0
  state.siteKey = 'site-key'
})

const fill = () => {
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@example.org' } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'not-the-password' } })
}
const signIn = () => screen.getByRole('button', { name: 'Sign In' }) as HTMLButtonElement

describe('sign-in CAPTCHA', () => {
  it('keeps Sign In disabled until the check passes, sends the token, and wants a new one after a try', async () => {
    requestSignIn.mockResolvedValue({ kind: 'invalid' })
    render(<LoginForm />)
    fill()
    expect(signIn().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Pass check' }))
    expect(signIn().disabled).toBe(false)
    await act(async () => fireEvent.click(signIn()))
    await waitFor(() =>
      expect(requestSignIn).toHaveBeenCalledWith('a@example.org', 'not-the-password', 'token-1'),
    )
    // The used token is gone and a fresh widget replaces the old one.
    await waitFor(() => expect(signIn().disabled).toBe(true))
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Pass check' }))
    await act(async () => fireEvent.click(signIn()))
    await waitFor(() =>
      expect(requestSignIn).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(String),
        'token-2',
      ),
    )
  })

  it('needs no check and sends no token when CAPTCHA is off', async () => {
    state.siteKey = ''
    requestSignIn.mockResolvedValue({ kind: 'invalid' })
    render(<LoginForm />)
    fill()
    expect(screen.queryByRole('button', { name: 'Pass check' })).toBeNull()
    expect(signIn().disabled).toBe(false)
    await act(async () => fireEvent.click(signIn()))
    await waitFor(() =>
      expect(requestSignIn).toHaveBeenCalledWith('a@example.org', 'not-the-password', undefined),
    )
  })
})
