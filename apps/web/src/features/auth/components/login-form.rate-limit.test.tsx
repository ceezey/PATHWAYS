/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const requestSignIn = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ configured: true, status: 'unauthenticated' }),
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { setSession: vi.fn() } }),
}))
vi.mock('../signin-request', () => ({ requestSignIn, formatLockRemaining: () => '0:42' }))
vi.mock('./captcha-field', () => ({ captchaSiteKey: '', CaptchaField: () => null }))

import { LoginForm } from './login-form'

afterEach(() => {
  cleanup()
  requestSignIn.mockReset()
})

const trySignIn = async (outcome: unknown) => {
  requestSignIn.mockResolvedValue(outcome)
  render(<LoginForm />)
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@example.org' } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'not-the-password' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign In' })))
  return screen.findByRole('alert')
}

describe('sign-in refusal messages', () => {
  it('names the short wait for the request limit, with no 15 minute claim', async () => {
    const alert = await trySignIn({ kind: 'locked', retryAfterSeconds: 42, rateLimited: true })
    expect(alert.textContent).toContain('Too many sign-in requests. Try again in 0:42.')
    expect(alert.textContent).not.toMatch(/15 minutes|failed/)
  })

  it('keeps the failure lockout message for repeated wrong passwords', async () => {
    const alert = await trySignIn({ kind: 'locked', retryAfterSeconds: 900 })
    expect(alert.textContent).toContain('Sign-in is locked for 15 minutes.')
    expect(alert.textContent).toContain('Too many failed sign-in attempts. Try again in 0:42.')
  })
})
