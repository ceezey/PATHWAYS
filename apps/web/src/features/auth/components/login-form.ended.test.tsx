/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ configured: true, status: 'unauthenticated' }),
}))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))

import { LoginForm } from './login-form'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/staff/login')
})

describe('sign-in notice after a session ends', () => {
  it.each([
    ['idle', 'You were signed out after 30 minutes without activity.'],
    ['session', 'Your session ended. Sign in again.'],
  ])('explains ended=%s', async (reason, text) => {
    window.history.replaceState(null, '', `/staff/login?ended=${reason}`)
    render(<LoginForm />)
    expect(await screen.findByText(text)).toBeTruthy()
  })

  it('shows nothing for an unknown or missing reason', () => {
    window.history.replaceState(null, '', '/staff/login?ended=other')
    render(<LoginForm />)
    expect(screen.queryByText(/signed out after|session ended/)).toBeNull()
  })
})
